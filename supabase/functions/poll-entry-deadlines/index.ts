import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { extractOrdinaryEntryDeadline, fetchEventDetailXml } from '../_shared/eventor.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';

type WatchRow = {
  event_id: string;
  event_name: string;
  event_date: string | null;
  device_id: string;
};

type PreferenceRow = {
  device_id: string;
  push_on_entry_deadline: boolean;
};

type TokenRow = {
  device_id: string;
  push_token: string | null;
};

type StateRow = {
  device_id: string;
  event_id: string;
  reminder_type: string;
};

type ReminderType = 'day_before' | 'three_hours';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/** Current time as naive Swedish wall-clock milliseconds (comparable with the
 * wall-clock deadlines from Eventor). */
function nowStockholmNaiveMs(): number {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), Number(get('hour')), Number(get('minute')), Number(get('second')));
}

function todayStockholmIso(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Stockholm calendar date (YYYY-MM-DD) for a stored timestamptz, so "checked
 * today" survives across UTC midnight. */
function stockholmIsoDateFromTimestamp(value: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Naive wall-clock milliseconds for a "YYYY-MM-DDTHH:mm:ss" string. */
function wallClockToNaiveMs(iso: string): number {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    return Number.NaN;
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const incomingCronSecret = request.headers.get('x-cron-secret');

    if (cronSecret && incomingCronSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized cron request.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const todayIso = todayStockholmIso();

    const [{ data: watches, error: watchesError }, { data: preferences, error: preferencesError }, { data: tokens, error: tokensError }, { data: states, error: statesError }] =
      await Promise.all([
        supabase.from('device_favorite_watches').select('event_id, event_name, event_date, device_id'),
        supabase.from('device_notification_preferences').select('device_id, push_on_entry_deadline').eq('push_on_entry_deadline', true),
        supabase.from('device_push_tokens').select('device_id, push_token').eq('is_active', true).not('push_token', 'is', null),
        supabase.from('entry_deadline_state').select('device_id, event_id, reminder_type'),
      ]);

    if (watchesError) throw watchesError;
    if (preferencesError) throw preferencesError;
    if (tokensError) throw tokensError;
    if (statesError) throw statesError;

    const optedInDeviceIds = new Set((preferences as PreferenceRow[] | null ?? []).map((row) => row.device_id));

    const tokensByDeviceId = new Map<string, string[]>();
    const seenTokens = new Set<string>();
    for (const row of (tokens as TokenRow[] | null ?? [])) {
      if (!row.push_token || seenTokens.has(row.push_token)) continue;
      seenTokens.add(row.push_token);
      const existing = tokensByDeviceId.get(row.device_id) ?? [];
      existing.push(row.push_token);
      tokensByDeviceId.set(row.device_id, existing);
    }

    const notifiedSet = new Set<string>();
    for (const row of (states as StateRow[] | null ?? [])) {
      notifiedSet.add(`${row.device_id}::${row.event_id}::${row.reminder_type}`);
    }

    // Group the qualifying watches (opted-in + has token + upcoming) by base event
    // id so each event is fetched once. Each device keeps its own event name.
    // eventDateByBaseEventId keeps the LATEST stage date seen per base event (a
    // multi-stage event's favorites can carry different per-stage dates) so the
    // deadline cache is only purged once every stage is over.
    const eventGroups = new Map<string, Map<string, string>>(); // baseEventId -> (deviceId -> eventName)
    const eventDateByBaseEventId = new Map<string, string>();

    for (const watch of (watches as WatchRow[] | null ?? [])) {
      if (!optedInDeviceIds.has(watch.device_id)) continue;
      if (!tokensByDeviceId.has(watch.device_id)) continue;
      if (watch.event_date && watch.event_date < todayIso) continue;

      const baseEventId = watch.event_id.split('::')[0] ?? watch.event_id;
      const perDevice = eventGroups.get(baseEventId) ?? new Map<string, string>();
      if (!perDevice.has(watch.device_id)) {
        perDevice.set(watch.device_id, watch.event_name);
      }
      eventGroups.set(baseEventId, perDevice);

      if (watch.event_date) {
        const currentMax = eventDateByBaseEventId.get(baseEventId);
        if (!currentMax || watch.event_date > currentMax) {
          eventDateByBaseEventId.set(baseEventId, watch.event_date);
        }
      }
    }

    // Purge cache rows for events whose (latest) stage date has already passed —
    // nothing left to remind about, so stop carrying them forever.
    await supabase.from('event_entry_deadline_cache').delete().lt('event_date', todayIso);

    const { data: cachedDeadlines } = await supabase
      .from('event_entry_deadline_cache')
      .select('event_id, ordinary_deadline, checked_at')
      .in('event_id', [...eventGroups.keys()]);
    const deadlineCacheByEventId = new Map((cachedDeadlines ?? []).map((row) => [row.event_id as string, row as { ordinary_deadline: string | null; checked_at: string }]));

    const nowNaive = nowStockholmNaiveMs();
    // Each due reminder is collected with the tokens it targets so we can send
    // FIRST and only record state for reminders that reached a valid token.
    const pending: Array<{ baseEventId: string; body: string; deviceId: string; eventName: string; reminderType: ReminderType; tokens: string[] }> = [];

    let checkedEvents = 0;

    for (const [baseEventId, deviceNames] of eventGroups) {
      const cached = deadlineCacheByEventId.get(baseEventId);
      const checkedToday = cached ? stockholmIsoDateFromTimestamp(cached.checked_at) === todayIso : false;

      let ordinaryDeadline: string | null;

      if (cached && checkedToday) {
        // Already validated today — reuse the cached deadline, no Eventor call.
        ordinaryDeadline = cached.ordinary_deadline;
      } else {
        try {
          const xml = await fetchEventDetailXml(baseEventId, 'poll-entry-deadlines');
          ordinaryDeadline = extractOrdinaryEntryDeadline(xml);
        } catch {
          if (!cached) continue;
          // Fetch failed — fall back to the last known deadline rather than skipping.
          ordinaryDeadline = cached.ordinary_deadline;
        }

        checkedEvents += 1;
        await supabase.from('event_entry_deadline_cache').upsert(
          {
            checked_at: new Date().toISOString(),
            event_date: eventDateByBaseEventId.get(baseEventId) ?? null,
            event_id: baseEventId,
            ordinary_deadline: ordinaryDeadline,
          },
          { onConflict: 'event_id' },
        );
      }

      if (!ordinaryDeadline) continue;

      const deadlineNaive = wallClockToNaiveMs(ordinaryDeadline);
      if (Number.isNaN(deadlineNaive)) continue;

      const deadlineDate = new Date(deadlineNaive);
      const startOfDeadlineDay = Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate(), 0, 0, 0);
      const dayBeforeTrigger = Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate() - 1, 20, 0, 0);
      const threeHourTrigger = deadlineNaive - THREE_HOURS_MS;
      const clockLabel = ordinaryDeadline.slice(11, 16);

      // Fire the evening before (20:00) while it is still the day before the deadline.
      const dayBeforeDue = nowNaive >= dayBeforeTrigger && nowNaive < startOfDeadlineDay;
      // Fire from three hours before up until the deadline itself.
      const threeHoursDue = nowNaive >= threeHourTrigger && nowNaive < deadlineNaive;

      for (const [deviceId, eventName] of deviceNames) {
        const pushTokens = tokensByDeviceId.get(deviceId) ?? [];
        if (pushTokens.length === 0) continue;

        const queue = (reminderType: ReminderType, body: string) => {
          const key = `${deviceId}::${baseEventId}::${reminderType}`;
          if (notifiedSet.has(key)) return;
          notifiedSet.add(key);
          pending.push({ baseEventId, body, deviceId, eventName, reminderType, tokens: pushTokens });
        };

        if (dayBeforeDue) {
          queue('day_before', `Anmälningstiden till ${eventName} går ut i morgon kl. ${clockLabel}`);
        }

        if (threeHoursDue) {
          queue('three_hours', `Anmälan till ${eventName} går ut om 3 timmar.`);
        }
      }
    }

    const messages = pending.flatMap((reminder) =>
      reminder.tokens.map((to) => ({
        body: reminder.body,
        data: { type: 'entry-deadline', eventId: reminder.baseEventId, reminderType: reminder.reminderType },
        sound: 'default' as const,
        title: `Anmälan ${reminder.eventName}`,
        to,
      })),
    );

    // Send FIRST, then record state only for reminders that actually reached a
    // valid token. A reminder whose only token is stale (DeviceNotRegistered) or
    // a send that throws is left unrecorded so it retries next run instead of
    // being silently swallowed.
    let sendFailed = false;
    let invalidTokenSet = new Set<string>();
    if (messages.length > 0) {
      try {
        const { invalidTokens } = await sendExpoPushMessages(messages);
        invalidTokenSet = new Set(invalidTokens);
        await deactivateInvalidTokens(supabase, invalidTokens);
      } catch (sendError) {
        console.error('[poll-entry-deadlines] Push send failed — not recording state so reminders retry next run:', sendError);
        sendFailed = true;
      }
    }

    if (!sendFailed) {
      const stateInserts = pending
        .filter((reminder) => reminder.tokens.some((token) => !invalidTokenSet.has(token)))
        .map((reminder) => ({ device_id: reminder.deviceId, event_id: reminder.baseEventId, reminder_type: reminder.reminderType }));

      if (stateInserts.length > 0) {
        await supabase.from('entry_deadline_state').upsert(stateInserts, { onConflict: 'device_id,event_id,reminder_type' });
      }
    }

    const pushCount = messages.length;

    return new Response(JSON.stringify({ checkedEvents, ok: true, pushCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown poll error.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
