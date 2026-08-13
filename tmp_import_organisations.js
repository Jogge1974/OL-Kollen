// One-off importer for the Eventor OrganisationList export into OrganisationRegister.
// Applies the migration, then upserts every organisation except foreign clubs
// (type = 'Club' with ParentOrganisationId = 650).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { XMLParser } = require('fast-xml-parser');

const XML_PATH = 'C:\\Users\\jgran\\Downloads\\organisations\\organisations.xml';
const MIGRATION_PATH = path.join(
  __dirname,
  'supabase',
  'migrations',
  '20260813120000_organisation_register.sql'
);

const client = new Client({
  host: 'aws-1-eu-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.hvscmyudneihjbtitffy',
  password: 'Hi!jF&1phWC303cz',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const asNumber = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number.parseInt(typeof v === 'object' ? v['#text'] : v, 10);
  return Number.isInteger(n) ? n : null;
};

const asText = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(typeof v === 'object' ? v['#text'] ?? '' : v).trim();
  return s.length > 0 ? s : null;
};

async function main() {
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const parser = new XMLParser({ attributeNamePrefix: '@_', ignoreAttributes: false });
  const parsed = parser.parse(xml);

  let orgs = parsed.OrganisationList.Organisation;
  if (!Array.isArray(orgs)) orgs = [orgs];

  const rows = [];
  let skippedForeign = 0;
  for (const org of orgs) {
    const type = asText(org['@_type']);
    const parentId = asNumber(org.ParentOrganisationId);
    if (type === 'Club' && parentId === 650) {
      skippedForeign += 1;
      continue;
    }
    const id = asNumber(org.Id);
    if (id === null) continue;
    rows.push({
      id,
      name: asText(org.Name) ?? '',
      shortName: asText(org.ShortName),
      mediaName: asText(org.MediaName),
      type,
      parentId,
      countryCode: asText(org.Country?.['@_code']),
      modifyTime: asText(org['@_modifyTime']),
    });
  }

  await client.connect();
  console.log('Applying migration...');
  await client.query(fs.readFileSync(MIGRATION_PATH, 'utf8'));

  console.log(`Upserting ${rows.length} organisations (skipped ${skippedForeign} foreign clubs)...`);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    chunk.forEach((r, idx) => {
      const b = idx * 8;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
      params.push(r.id, r.name, r.shortName, r.mediaName, r.type, r.parentId, r.countryCode, r.modifyTime);
    });
    await client.query(
      `insert into public."OrganisationRegister"
         ("Id","Name","ShortName","MediaName","Type","ParentOrganisationId","CountryCode","ModifyTime")
       values ${values.join(',')}
       on conflict ("Id") do update set
         "Name" = excluded."Name",
         "ShortName" = excluded."ShortName",
         "MediaName" = excluded."MediaName",
         "Type" = excluded."Type",
         "ParentOrganisationId" = excluded."ParentOrganisationId",
         "CountryCode" = excluded."CountryCode",
         "ModifyTime" = excluded."ModifyTime",
         "UpdatedAt" = now()`,
      params
    );
  }

  const counts = await client.query(
    `select "Type", count(*)::int as n from public."OrganisationRegister" group by "Type" order by "Type"`
  );
  console.log('Rows per type:');
  counts.rows.forEach((r) => console.log(`  ${r.Type}: ${r.n}`));

  await client.end();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  client.end().finally(() => process.exit(1));
});
