import { getStoredJson, removeStoredValue, setStoredJson } from '@/src/services/secureStorage';

const EVENTOR_LOGIN_URL = 'https://eventor.orientering.se/Login';
const EVENTOR_WEB_SESSION_STORAGE_KEY = 'olkollen.eventor.web.session';

type StoredEventorWebSession = {
  cookie: string;
  storedAt: string;
};

export async function refreshStoredEventorWebSessionCookie(username: string, password: string) {
  const cookie = await loginAndCaptureSessionCookie(username, password);

  if (cookie) {
    await setStoredJson(EVENTOR_WEB_SESSION_STORAGE_KEY, {
      cookie,
      storedAt: new Date().toISOString(),
    } satisfies StoredEventorWebSession);
  }

  return cookie;
}

export async function getStoredEventorWebSessionCookie() {
  const stored = await getStoredJson<StoredEventorWebSession>(EVENTOR_WEB_SESSION_STORAGE_KEY);
  return stored?.cookie ?? null;
}

export async function clearStoredEventorWebSessionCookie() {
  await removeStoredValue(EVENTOR_WEB_SESSION_STORAGE_KEY);
}

async function loginAndCaptureSessionCookie(username: string, password: string) {
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

  const setCookieHeader = response.headers.get('set-cookie') ?? response.headers.get('Set-Cookie') ?? '';
  const cookie = extractSessionCookie(setCookieHeader);

  if (cookie) {
    return cookie;
  }

  return extractSessionCookieFromResponseText(await response.text());
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
