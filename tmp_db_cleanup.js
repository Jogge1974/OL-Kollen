const { Client } = require('pg');
const c = new Client({
  host: 'db.hvscmyudneihjbtitffy.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Hi!jF&1phWC303cz',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

c.connect()
  .then(() => c.query(`
    -- Keep only the most recently updated row per person_id when tokens are identical
    WITH ranked AS (
      SELECT ctid, ROW_NUMBER() OVER (PARTITION BY person_id, push_token ORDER BY updated_at DESC) as rn
      FROM device_push_tokens
      WHERE person_id = '10476'
    )
    DELETE FROM device_push_tokens
    WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)
    RETURNING person_id, device_id, updated_at
  `))
  .then((r) => {
    console.log('Deleted', r.rowCount, 'duplicate row(s):');
    r.rows.forEach((row) => console.log(' -', row.person_id, row.device_id, row.updated_at));
    return c.query(`SELECT person_id, device_id, LEFT(push_token, 30) as token_prefix, is_active, updated_at FROM device_push_tokens WHERE person_id = '10476'`);
  })
  .then((r) => {
    console.log('\nKvar for 10476:');
    r.rows.forEach((row) => console.log(' ', row.device_id, row.token_prefix, 'active:', row.is_active, row.updated_at));
    c.end();
  })
  .catch((e) => { console.error(e.message); c.end(); });
