# Push Deploy

Det här projektet är nu förberett för:

- favoritmarkerade tävlingar
- lokala pushinställningar i appen
- registrering av Expo push-token
- synk mot Supabase
- schemalagd bevakning av Eventors `HashTableEntry`

## 1. Förutsättningar

Installera CLI-verktygen:

```bash
npm install -g eas-cli supabase
```

Logga in:

```bash
eas login
supabase login
```

## 2. Expo / EAS

Koppla projektet till EAS:

```bash
eas build:configure
```

När projektet har kopplats får du ett `projectId`. Lägg det i lokal `.env` som:

```env
EXPO_PUBLIC_EXPO_PROJECT_ID=din-eas-project-id
```

Om du vill bygga testversioner senare:

```bash
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

För produktion:

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

## 3. Supabase link

Länka projektet:

```bash
supabase link --project-ref ditt-project-ref
```

## 4. Databas

Kör migrationerna:

```bash
supabase db push
```

Det skapar tabellerna:

- `app_users`
- `notification_preferences`
- `favorite_event_watches`
- `device_push_tokens`

## 5. Secrets

Sätt secrets i Supabase:

```bash
supabase secrets set EVENTOR_API_KEY="din-eventor-nyckel" --project-ref ditt-project-ref
supabase secrets set CRON_SECRET="valfri-lång-hemlig-sträng" --project-ref ditt-project-ref
```

`SUPABASE_SERVICE_ROLE_KEY` finns redan som inbyggd miljö i edge functions i projektet.

## 6. Deploy Edge Functions

Deploya appsynken:

```bash
supabase functions deploy push-sync --project-ref ditt-project-ref
```

Deploya bevakningsfunktionen:

```bash
supabase functions deploy poll-eventor-publication --project-ref ditt-project-ref
```

## 7. Schemalägg bevakningen

Skapa ett schemajobb i Supabase SQL Editor. Exempel: kör var 10:e minut.

Byt ut:

- `DIN_PROJECT_REF`
- `DIN_ANON_KEY`
- `DIN_CRON_SECRET`

```sql
select
  cron.schedule(
    'poll-eventor-publication-every-10-min',
    '*/10 * * * *',
    $$
    select
      net.http_post(
        url := 'https://DIN_PROJECT_REF.supabase.co/functions/v1/poll-eventor-publication',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer DIN_ANON_KEY',
          'x-cron-secret', 'DIN_CRON_SECRET'
        ),
        body := '{}'::jsonb
      );
    $$
  );
```

Om du vill ta bort jobbet senare:

```sql
select cron.unschedule('poll-eventor-publication-every-10-min');
```

## 8. Appmiljö

Säkerställ att lokal `.env` innehåller:

```env
EXPO_PUBLIC_EVENTOR_API_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
EXPO_PUBLIC_EXPO_PROJECT_ID=...
```

## 9. Det som återstår när Apple/Firebase finns

### iOS

Du behöver koppla APNs via EAS credentials.

### Android

Du behöver koppla FCM via Firebase credentials.

När det är gjort fungerar samma appkod vidare. Du behöver alltså normalt inte bygga om pusharkitekturen, bara komplettera credentials och skapa nya builds.

## 10. Nuvarande begränsning

`push-sync` använder i nuläget inte Supabase Auth för att verifiera användaren. Det räcker för utveckling och intern testning, men innan publik release bör synken bindas till riktig autentisering eller en signerad appidentitet.
