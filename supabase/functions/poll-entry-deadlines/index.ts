import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { extractOrdinaryEntryDeadline, fetchEventDetailXml } from '../_shared/eventor.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';

type WatchRow = {
  event_id: string;
  event_name: string;
  event_date: string | null;
  person_id: string;
};

type PreferenceRow = {
  person_id: string;
  push_on_entry_deadline: boolean;
};

type TokenRow = {
  person_id: string;
  push_token: string | null;
};

type StateRow = {
  person_id: string;
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
        supabase.from('favorite_event_watches').select('event_id, event_name, event_date, person_id'),
        supabase.from('notification_preferences').select('person_id, push_on_entry_deadline').eq('push_on_entry_deadline', true),
        supabase.from('device_push_tokens').select('person_id, push_token').eq('is_active', true).not('push_token', 'is', null),
        supabase.from('entry_deadline_state').select('person_id, event_id, reminder_type'),
      ]);

    if (watchesError) throw watchesError;
    if (preferencesError) throw preferencesError;
    if (tokensError) throw tokensError;
    if (statesError) throw statesError;

    const optedInPersonIds = new Set((preferences as PreferenceRow[] | null ?? []).map((row) => row.person_id));

    const tokensByPersonId = new Map<string, string[]>();
    const seenTokens = new Set<string>();
    for (const row of (tokens as TokenRow[] | null ?? [])) {
      if (!row.push_token || seenTokens.has(row.push_token)) continue;
      seenTokens.add(row.push_token);
      const existing = tokensByPersonId.get(row.person_id) ?? [];
      existing.push(row.push_token);
      tokensByPersonId.set(row.person_id, existing);
    }

    const notifiedSet = new Set<string>();
    for (const row of (states as StateRow[] | null ?? [])) {
      notifiedSet.add(`${row.person_id}::${row.event_id}::${row.reminder_type}`);
    }

    // Group the qualifying watches (opted-in + has token + upcoming) by base event
    // id so each event is fetched once. Each user keeps their own event name.
    const eventGroups = new Map<string, Map<string, string>>(); // baseEventId -> (personId -> eventName)

    for (const watch of (watches as WatchRow[] | null ?? [])) {
      if (!optedInPersonIds.has(watch.person_id)) continue;
      if (!tokensByPersonId.has(watch.person_id)) continue;
      if (watch.event_date && watch.event_date < todayIso) continue;

      const baseEventId = watch.event_id.split('::')[0] ?? watch.event_id;
      const perPerson = eventGroups.get(baseEventId) ?? new Map<string, string>();
      if (!perPerson.has(watch.person_id)) {
        perPerson.set(watch.person_id, watch.event_name);
      }
      eventGroups.set(baseEventId, perPerson);
    }

    const nowNaive = nowStockholmNaiveMs();
    const messages: Array<{ body: string; data: Record<string, unknown>; title: string; to: string }> = [];
    const stateInserts: Array<{ person_id: string; event_id: string; reminder_type: ReminderType }> = [];

    let checkedEvents = 0;

    for (const [baseEventId, personNames] of eventGroups) {
      let ordinaryDeadline: string | null;
      try {
        const xml = await fetchEventDetailXml(baseEventId);
        ordinaryDeadline = extractOrdinaryEntryDeadline(xml);
      } catch {
        continue;
      }

      checkedEvents += 1;

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

      for (const [personId, eventName] of personNames) {
        const pushTokens = tokensByPersonId.get(personId) ?? [];
        if (pushTokens.length === 0) continue;

        const queue = (reminderType: ReminderType, body: string) => {
          if (notifiedSet.has(`${personId}::${baseEventId}::${reminderType}`)) return;
          for (const pushToken of pushTokens) {
            messages.push({
              body,
              data: { type: 'entry-deadline', eventId: baseEventId, reminderType },
              title: `Anmälan ${eventName}`,
              to: pushToken,
            });
          }
          stateInserts.push({ person_id: personId, event_id: baseEventId, reminder_type: reminderType });
          notifiedSet.add(`${personId}::${baseEventId}::${reminderType}`);
        };

        if (dayBeforeDue) {
          queue('day_before', `Anmälningstiden till ${eventName} går ut i morgon kl. ${clockLabel}`);
        }

        if (threeHoursDue) {
          queue('three_hours', `Anmälan till ${eventName} går ut om 3 timmar.`);
        }
      }
    }

    let pushCount = 0;
    if (messages.length > 0) {
      // Record the sent state first so a retry can't double-send.
      if (stateInserts.length > 0) {
        await supabase.from('entry_deadline_state').upsert(stateInserts, { onConflict: 'person_id,event_id,reminder_type' });
      }

      const { invalidTokens } = await sendExpoPushMessages(messages.map((message) => ({ ...message, sound: 'default' })));
      await deactivateInvalidTokens(supabase, invalidTokens);
      pushCount = messages.length;
    }

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
