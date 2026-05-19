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
    SELECT person_id, device_id, LEFT(push_token, 30) as token_prefix, is_active, platform, updated_at
    FROM device_push_tokens
    ORDER BY updated_at DESC
  `))
  .then((r) => {
    console.log('person_id | device_id | token | active | platform | updated_at');
    console.log('-'.repeat(100));
    r.rows.forEach((row) => {
      console.log(
        row.person_id, '|',
        (row.device_id || '').substring(0, 15), '|',
        row.token_prefix || '(null)', '|',
        row.is_active, '|',
        row.platform, '|',
        row.updated_at
      );
    });
    c.end();
  })
  .catch((e) => { console.error(e.message); c.end(); });
