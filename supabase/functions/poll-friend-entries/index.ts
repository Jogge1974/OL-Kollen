import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from '../_shared/cors.ts';
import { sendExpoPushMessages } from '../_shared/expoPush.ts';

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
  entry_id: string;
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
  entryId: string;
  personId: string;
  eventId: string;
  eventName: string;
  modifyDate: string; // ISO date+time string for the entry modification
};

function parseEntriesXml(xml: string): ParsedEntry[] {
  const results: ParsedEntry[] = [];

  // Split on <Entry> blocks
  const entryBlocks = xml.split(/<Entry\b/);

  for (let i = 1; i < entryBlocks.length; i++) {
    const block = entryBlocks[i];

    // EntryId
    const entryIdMatch = block.match(/<EntryId>(\d+)<\/EntryId>/);
    if (!entryIdMatch) continue;
    const entryId = entryIdMatch[1];

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
    // We look for the last ModifyDate in the block (the entry-level one, not event-level)
    const modifyMatches = [...block.matchAll(/<ModifyDate>\s*<Date>([^<]+)<\/Date>\s*<Clock>([^<]+)<\/Clock>\s*<\/ModifyDate>/g)];
    const lastModify = modifyMatches[modifyMatches.length - 1];
    const modifyDate = lastModify
      ? `${lastModify[1].trim()}T${lastModify[2].trim()}`
      : '';

    results.push({ entryId, personId, eventId, eventName, modifyDate });
  }

  return results;
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

    // 3. Time window: entries modified in the last 25 minutes
    //    (cron runs every 20 min, 25 min window gives overlap to avoid misses)
    const now = new Date();
    const windowStart = new Date(now.getTime() - 25 * 60 * 1000);
    const fromModifyDate = formatEventorDateTime(windowStart);
    const toModifyDate = formatEventorDateTime(now);

    // 4. Fetch entries for each friend from Eventor
    const allParsedEntries: ParsedEntry[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < uniqueFriendIds.length; i += BATCH_SIZE) {
      const batch = uniqueFriendIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (friendId) => {
          try {
            // Use a dummy organisationIds=1 (required param but doesn't filter personIds)
            const path = `/entries?personIds=${friendId}&organisationIds=1&includeEventElement=true` +
              `&fromModifyDate=${encodeURIComponent(fromModifyDate)}` +
              `&toModifyDate=${encodeURIComponent(toModifyDate)}`;
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

    // 5. Check which entries have already been notified
    const entryIds = allParsedEntries.map((e) => e.entryId);
    const { data: existingStates } = await supabase
      .from('friend_entry_state')
      .select('entry_id, friend_person_id')
      .in('entry_id', entryIds);

    const notifiedSet = new Set<string>();
    for (const row of (existingStates ?? []) as EntryStateRow[]) {
      notifiedSet.add(`${row.friend_person_id}::${row.entry_id}`);
    }

    // 6. Build notifications
    const allMessages: Array<{ body: string; data: Record<string, unknown>; sound: 'default'; title: string; to: string }> = [];
    const stateInserts: Array<{ entry_id: string; event_id: string; event_name: string; friend_person_id: string }> = [];
    const insertedKeys = new Set<string>();

    for (const entry of allParsedEntries) {
      const stateKey = `${entry.personId}::${entry.entryId}`;
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

      // Record state (once per friend+entry combo)
      if (!insertedKeys.has(stateKey)) {
        insertedKeys.add(stateKey);
        stateInserts.push({
          entry_id: entry.entryId,
          event_id: entry.eventId,
          event_name: entry.eventName,
          friend_person_id: entry.personId,
        });
      }
    }

    // 7. Send pushes
    if (allMessages.length > 0) {
      await sendExpoPushMessages(allMessages);
    }

    // 8. Record notified entries
    if (stateInserts.length > 0) {
      await supabase
        .from('friend_entry_state')
        .upsert(stateInserts, { onConflict: 'friend_person_id,entry_id' });
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

function formatEventorDateTime(date: Date): string {
  // Eventor expects Swedish local time: YYYY-MM-DD HH:MM:SS
  const pad = (n: number) => String(n).padStart(2, '0');
  // Convert UTC to Swedish time (CET/CEST)
  const swedish = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  return `${swedish.getFullYear()}-${pad(swedish.getMonth() + 1)}-${pad(swedish.getDate())} ${pad(swedish.getHours())}:${pad(swedish.getMinutes())}:${pad(swedish.getSeconds())}`;
}
