import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { deactivateInvalidTokens, sendExpoPushMessages } from '../_shared/expoPush.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FriendWatchRow = {
  created_at: string;
  friend_person_id: string;
  friend_name: string;
  friend_club: string | null;
  person_id: string;
  push_on_entry: boolean;
};

type TokenRow = {
  person_id: string;
  push_token: string;
};

type EntryStateRow = {
  event_id: string;
  friend_person_id: string;
};

// ---------------------------------------------------------------------------
// Eventor API
// ---------------------------------------------------------------------------

const EVENTOR_BASE_URL = 'https://eventor.orientering.se/api';

async function fetchEventorXml(path: string): Promise<string> {
  const apiKey = Deno.env.get('EVENTOR_API_KEY');
  if (!apiKey) throw new Error('Missing EVENTOR_API_KEY.');

  const response = await fetch(`${EVENTOR_BASE_URL}${path}`, {
    headers: { ApiKey: apiKey, Accept: 'application/xml' },
  });

  if (!response.ok) {
    throw new Error(`Eventor ${path} → ${response.status}`);
  }

  return await response.text();
}

// ---------------------------------------------------------------------------
// XML parsing — minimal regex-based extraction
// ---------------------------------------------------------------------------

type ParsedEntry = {
  personId: string;
  eventId: string;
  eventName: string;
  modifyDate: string; // ISO date+time string for the entry modification
};

function parseEntriesXml(xml: string): ParsedEntry[] {
  // Deduplicate by personId+eventId — a multi-stage event may produce
  // several <Entry> blocks but we only care about the event level.
  const seen = new Map<string, ParsedEntry>();

  // Split on <Entry> blocks
  const entryBlocks = xml.split(/<Entry\b/);

  for (let i = 1; i < entryBlocks.length; i++) {
    const block = entryBlocks[i];

    // PersonId from Competitor
    const personIdMatch = block.match(/<Competitor\b[\s\S]*?<PersonId>(\d+)<\/PersonId>/);
    if (!personIdMatch) continue;
    const personId = personIdMatch[1];

    // Event info
    const eventBlock = block.match(/<Event\b[\s\S]*?<\/Event>/);
    if (!eventBlock) continue;

    const eventIdMatch = eventBlock[0].match(/<EventId>(\d+)<\/EventId>/);
    const eventNameMatch = eventBlock[0].match(/<Name>([^<]+)<\/Name>/);
    if (!eventIdMatch) continue;

    const eventId = eventIdMatch[1];
    const eventName = eventNameMatch?.[1] ?? 'Okänd tävling';

    // Entry's own ModifyDate (at end of <Entry>, after </Event>)
    const modifyMatches = [...block.matchAll(/<ModifyDate>\s*<Date>([^<]+)<\/Date>\s*<Clock>([^<]+)<\/Clock>\s*<\/ModifyDate>/g)];
    const lastModify = modifyMatches[modifyMatches.length - 1];
    const modifyDate = lastModify
      ? `${lastModify[1].trim()}T${lastModify[2].trim()}`
      : '';

    // Keep the latest modifyDate per person+event
    const key = `${personId}::${eventId}`;
    const existing = seen.get(key);
    if (!existing || modifyDate > existing.modifyDate) {
      seen.set(key, { personId, eventId, eventName, modifyDate });
    }
  }

  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth: require CRON_SECRET
    const cronSecret = Deno.env.get('CRON_SECRET');
    const incomingSecret = request.headers.get('x-cron-secret');
    if (cronSecret && incomingSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Load friend watches (only those with push_on_entry = true) and tokens
    const [
      { data: watches, error: watchesErr },
      { data: tokens, error: tokensErr },
    ] = await Promise.all([
      supabase
        .from('friend_watches')
        .select('created_at, friend_club, friend_person_id, friend_name, person_id, push_on_entry'),
      supabase
        .from('device_push_tokens')
        .select('person_id, push_token')
        .eq('is_active', true)
        .not('push_token', 'is', null),
    ]);

    if (watchesErr) throw watchesErr;
    if (tokensErr) throw tokensErr;

    const allWatches = (watches ?? []) as FriendWatchRow[];
    const tokensByPerson = new Map<string, string[]>();
    for (const row of (tokens ?? []) as TokenRow[]) {
      const arr = tokensByPerson.get(row.person_id) ?? [];
      arr.push(row.push_token);
      tokensByPerson.set(row.person_id, arr);
    }

    // 2. Unique friend person IDs
    const uniqueFriendIds = [...new Set(allWatches.map((w) => w.friend_person_id))];

    if (uniqueFriendIds.length === 0) {
      return jsonOk({ checkedFriends: 0, ok: true, pushCount: 0 });
    }

    // 3. Date window: entries for events from today up to 9 months ahead.
    //    We rely on friend_entry_state to deduplicate already-notified entries.
    const now = new Date();
    const fromEventDate = formatEventorDate(now);
    const toDate = new Date(now.getTime() + 270 * 24 * 60 * 60 * 1000);
    const toEventDate = formatEventorDate(toDate);

    // 4. Fetch entries for each friend from Eventor
    const allParsedEntries: ParsedEntry[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < uniqueFriendIds.length; i += BATCH_SIZE) {
      const batch = uniqueFriendIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (friendId) => {
          try {
            const path = `/entries?personIds=${friendId}&includeEventElement=true` +
              `&fromEventDate=${fromEventDate}&toEventDate=${toEventDate}`;
            const xml = await fetchEventorXml(path);
            const entries = parseEntriesXml(xml);
            for (const entry of entries) {
              allParsedEntries.push(entry);
            }
          } catch (err) {
            console.warn(`[poll-friend-entries] Eventor fetch failed for friend ${friendId}:`, err);
          }
        }),
      );
    }

    if (allParsedEntries.length === 0) {
      return jsonOk({ checkedFriends: uniqueFriendIds.length, ok: true, pushCount: 0, entriesFound: 0 });
    }

    // 5. Check which entries have already been notified (dedup by event)
    const eventIds = allParsedEntries.map((e) => e.eventId);
    const friendIds = allParsedEntries.map((e) => e.personId);
    const { data: existingStates } = await supabase
      .from('friend_entry_state')
      .select('event_id, friend_person_id')
      .in('event_id', eventIds)
      .in('friend_person_id', friendIds);

    const notifiedSet = new Set<string>();
    for (const row of (existingStates ?? []) as EntryStateRow[]) {
      notifiedSet.add(`${row.friend_person_id}::${row.event_id}`);
    }

    // 6. Build notifications
    const allMessages: Array<{ body: string; data: Record<string, unknown>; sound: 'default'; title: string; to: string }> = [];
    const stateInserts: Array<{ event_id: string; event_name: string; friend_person_id: string }> = [];
    const insertedKeys = new Set<string>();

    for (const entry of allParsedEntries) {
      const stateKey = `${entry.personId}::${entry.eventId}`;
      if (notifiedSet.has(stateKey)) continue;

      // Find all watchers for this friend
      const watchers = allWatches.filter((w) => w.friend_person_id === entry.personId);

      for (const watch of watchers) {
        // Skip if friend was added AFTER the entry was made
        // (watch.created_at is when the friendship was synced to server)
        if (entry.modifyDate && watch.created_at) {
          const entryTime = new Date(entry.modifyDate);
          const friendAddedTime = new Date(watch.created_at);
          if (entryTime < friendAddedTime) continue;
        }

        // Skip if push_on_entry is disabled
        if (!watch.push_on_entry) continue;

        const userTokens = tokensByPerson.get(watch.person_id);
        if (!userTokens || userTokens.length === 0) continue;

        const clubSuffix = watch.friend_club ? `, ${watch.friend_club}` : '';
        for (const token of userTokens) {
          allMessages.push({
            body: `${watch.friend_name}${clubSuffix} har anmält sig till ${entry.eventName}.`,
            data: {
              type: 'friend-entry',
              friendPersonId: entry.personId,
            },
            sound: 'default',
            title: 'Ny anmälan',
            to: token,
          });
        }
      }

      // Record state (once per friend+event combo)
      if (!insertedKeys.has(stateKey)) {
        insertedKeys.add(stateKey);
        stateInserts.push({
          event_id: entry.eventId,
          event_name: entry.eventName,
          friend_person_id: entry.personId,
        });
      }
    }

    // 7. Send pushes
    if (allMessages.length > 0) {
      const { invalidTokens } = await sendExpoPushMessages(allMessages);
      await deactivateInvalidTokens(supabase, invalidTokens);
    }

    // 8. Record notified entries
    if (stateInserts.length > 0) {
      await supabase
        .from('friend_entry_state')
        .upsert(stateInserts, { onConflict: 'friend_person_id,event_id' });
    }

    return jsonOk({
      checkedFriends: uniqueFriendIds.length,
      entriesFound: allParsedEntries.length,
      ok: true,
      pushCount: allMessages.length,
    });
  } catch (error) {
    console.error('[poll-friend-entries] Error:', error);
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formatEventorDate(date: Date): string {
  // Eventor expects YYYY-MM-DD for event date filters
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
