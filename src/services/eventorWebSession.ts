import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';
import { AuthenticatedUser } from '@/src/types/user';

const EVENTOR_BASE_URL = 'https://eventor.orientering.se';
const EVENTOR_LOGIN_URL = `${EVENTOR_BASE_URL}/Login`;
const EVENTOR_SETTINGS_URL = `${EVENTOR_BASE_URL}/MyPages/Settings`;
const EVENTOR_WEB_SESSION_STORAGE_KEY = 'olkollen.eventor.web.session';

type StoredEventorWebSession = {
  cookie: string;
  storedAt: string;
};

export type WebLoginResult = {
  cookie: string | null;
  success: boolean;
  user: AuthenticatedUser;
};

export async function loginViaWeb(username: string, password: string): Promise<WebLoginResult> {
  const emptyUser: AuthenticatedUser = {
    accessLevel: 'free',
    birthDate: null,
    email: null,
    firstName: null,
    fullName: null,
    gender: null,
    lastName: null,
    organisationIds: [],
    organisationName: null,
    personId: null,
    username,
  };

  // Pre-flight GET to establish session
  await fetch(EVENTOR_LOGIN_URL, {
    headers: getCommonHeaders(),
    credentials: 'include',
    method: 'GET',
  }).catch(() => null);

  const body = new URLSearchParams({
    PersonLogin: 'Logga in',
    PersonPassword: password,
    PersonPersistentLogin: 'false',
    PersonUsername: username,
  }).toString();

  const response = await fetch(EVENTOR_LOGIN_URL, {
    body,
    headers: {
      ...getCommonHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: EVENTOR_LOGIN_URL,
    },
    credentials: 'include',
    method: 'POST',
  });

  const html = await response.text();

  // In React Native, cookies are managed internally by the HTTP layer.
  // Try to extract from headers (works in Node/tests), but fall back to relying on credentials: 'include'.
  const setCookieHeader = response.headers.get('set-cookie') ?? response.headers.get('Set-Cookie') ?? '';
  const cookie = extractSessionCookie(setCookieHeader) ?? extractSessionCookieFromResponseText(html);

  console.log('[Eventor] Login response:', { hasCookie: !!cookie, loginFailed: html.includes('misslyckades') });

  // If the page contains "misslyckades", login failed
  if (html.includes('misslyckades')) {
    return { cookie: null, success: false, user: emptyUser };
  }

  // Store the cookie if we could extract it (for non-fetch usage like web scraping)
  if (cookie) {
    await setStoredJson(EVENTOR_WEB_SESSION_STORAGE_KEY, {
      cookie,
      storedAt: new Date().toISOString(),
    } satisfies StoredEventorWebSession);
  }

  // Scrape profile data — use credentials: 'include' so RN sends cookies automatically
  const user = await scrapeProfileFromSettings(username);

  return { cookie, success: true, user };
}

export async function refreshStoredEventorWebSessionCookie(username: string, password: string) {
  const result = await loginViaWeb(username, password);
  return result.cookie;
}

export async function getStoredEventorWebSessionCookie() {
  const stored = await getStoredJson<StoredEventorWebSession>(EVENTOR_WEB_SESSION_STORAGE_KEY);
  return stored?.cookie ?? null;
}

export async function clearStoredEventorWebSessionCookie() {
  await removeStoredValue(EVENTOR_WEB_SESSION_STORAGE_KEY);
}

async function scrapeProfileFromSettings(username: string): Promise<AuthenticatedUser> {
  const fallback: AuthenticatedUser = {
    accessLevel: 'free',
    birthDate: null,
    email: null,
    firstName: null,
    fullName: null,
    gender: null,
    lastName: null,
    organisationIds: [],
    organisationName: null,
    personId: null,
    username,
  };

  try {
    const response = await fetch(EVENTOR_SETTINGS_URL, {
      headers: getCommonHeaders(),
      credentials: 'include',
      method: 'GET',
    });

    if (!response.ok) {
      console.warn('[Eventor] Settings page returned', response.status);
      return fallback;
    }

    const html = await response.text();

    // If we got redirected to the login page, the cookie didn't work
    if (html.includes('misslyckades') || !html.includes('Person-id')) {
      console.warn('[Eventor] Settings page did not contain profile data (possibly redirected to login)');
      return fallback;
    }

    const firstName = extractFormValue(html, 'Data.Person.FirstName');
    const lastName = extractFormValue(html, 'Data.Person.LastName');
    const birthDate = extractFormValue(html, 'Data.Person.BirthDate.Date');
    const email = extractFormValue(html, 'Data.Contact.Email');
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
    const organisationIds = extractOrganisationIds(html);
    const gender = extractGender(html);
    const organisationName = extractOrganisationName(html);
    const personId = extractPersonId(html);

    console.log('[Eventor] Scraped profile:', { personId, fullName, organisationName, orgIds: organisationIds });

    return {
      accessLevel: 'free',
      birthDate: birthDate || null,
      email: email || null,
      firstName: firstName || null,
      fullName,
      gender,
      lastName: lastName || null,
      organisationIds,
      organisationName,
      personId,
      username,
    };
  } catch (error) {
    console.warn('[Eventor] Failed to scrape profile from Settings', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return fallback;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractFormValue(html: string, fieldName: string): string | null {
  // Match input fields like: name="Data.Person.FirstName" ... value="Jonas"
  const escaped = fieldName.replace(/\./g, '\\.');
  const pattern = new RegExp(`name="${escaped}"[^>]*value="([^"]*)"`, 'i');
  const match = html.match(pattern);
  const raw = match?.[1]?.trim() || null;
  return raw ? decodeHtmlEntities(raw) : null;
}

function extractOrganisationIds(html: string): string[] {
  // Match hidden fields like: name="Data.PersonOrganisation.OrganisationIds_259" value="259"
  const matches = html.matchAll(/name="Data\.PersonOrganisation\.OrganisationIds_(\d+)"/g);
  const ids: string[] = [];
  for (const match of matches) {
    ids.push(match[1]);
  }

  // Find the default (checked) organisation and put it first
  const checkedMatch = html.match(
    /checked="checked"[^>]*name="Data\.PersonOrganisation\.DefaultOrganisationId"[^>]*value="(\d+)"/i,
  ) ?? html.match(
    /name="Data\.PersonOrganisation\.DefaultOrganisationId"[^>]*checked="checked"[^>]*value="(\d+)"/i,
  ) ?? html.match(
    /name="Data\.PersonOrganisation\.DefaultOrganisationId"[^>]*value="(\d+)"[^>]*checked="checked"/i,
  );
  if (checkedMatch) {
    const defaultId = checkedMatch[1];
    const idx = ids.indexOf(defaultId);
    if (idx > 0) {
      ids.splice(idx, 1);
      ids.unshift(defaultId);
    }
  }

  return ids;
}

function extractGender(html: string): 'D' | 'H' | null {
  // Look for gender radio buttons
  const maleChecked = html.match(/name="Data\.Person\.Sex"[^>]*value="M"[^>]*checked/i);
  if (maleChecked) return 'H';
  const femaleChecked = html.match(/name="Data\.Person\.Sex"[^>]*value="[FW]"[^>]*checked/i);
  if (femaleChecked) return 'D';

  // Select dropdown: <select name="Data.Person.Sex"> ... <option selected="selected" value="Male">man</option>
  const selectBlock = html.match(/name="Data\.Person\.Sex"[^>]*>[\s\S]*?<\/select>/i);
  if (selectBlock) {
    const selectedOption = selectBlock[0].match(/selected="selected"[^>]*value="([^"]*)"/i)
      ?? selectBlock[0].match(/value="([^"]*)"[^>]*selected="selected"/i);
    if (selectedOption) {
      const value = selectedOption[1].toUpperCase();
      if (value === 'M' || value === 'MALE') return 'H';
      if (value === 'F' || value === 'W' || value === 'FEMALE') return 'D';
    }
  }

  return null;
}

function extractOrganisationName(html: string): string | null {
  // Match: <input checked="checked" ... name="Data.PersonOrganisation.DefaultOrganisationId" ...>
  //        <label ...>Västvärmlands OK</label>
  // Attributes can appear in any order, so match the input with both checked and DefaultOrganisationId,
  // then capture the following label text.
  const checkedRadio = html.match(
    /<input[^>]*checked="checked"[^>]*name="Data\.PersonOrganisation\.DefaultOrganisationId"[^>]*>\s*<label[^>]*>([^<]+)/i,
  ) ?? html.match(
    /<input[^>]*name="Data\.PersonOrganisation\.DefaultOrganisationId"[^>]*checked="checked"[^>]*>\s*<label[^>]*>([^<]+)/i,
  );
  if (checkedRadio) return decodeHtmlEntities(checkedRadio[1].trim());

  // Fallback: if only one org exists (no checked radio), grab the only label under Klubbar
  const singleOrg = html.match(/Klubbar<\/h3>[\s\S]*?<label[^>]*>([^<]+)/i);
  if (singleOrg) return decodeHtmlEntities(singleOrg[1].trim());

  return null;
}

function extractPersonId(html: string): string | null {
  // Match: <label>Person-id</label> ... <span>12345</span>
  const match = html.match(/Person-id<\/label>[\s\S]*?<span>(\d+)<\/span>/i);
  return match?.[1] ?? null;
}

function extractSessionCookie(headerValue: string) {
  const match = headerValue.match(/ASP\.NET_SessionId=[^;,\s]+/i);
  return match?.[0] ?? null;
}

function extractSessionCookieFromResponseText(responseText: string) {
  const match = responseText.match(/ASP\.NET_SessionId=[^;,\s]+/i);
  return match?.[0] ?? null;
}

function getCommonHeaders() {
  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Kontrollen/1.0',
  };
}
