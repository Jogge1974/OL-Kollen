import { Linking } from 'react-native';

import { create } from 'zustand';

import { usePreferencesStore } from '@/src/store/preferencesStore';

// Eventor's site sits behind bot/security verification that breaks in the
// in-app WebView, so eventor.orientering.se links always open directly in the
// system browser, ignoring the preference below. Only the Liveresultat
// competitions site and Livelox respect "Externa länkar" (ask/app/browser).
// Everything else (maps handoffs, in-app document viewers, arbitrary
// announcement links) keeps opening exactly as it always has.
const ALWAYS_BROWSER_HOSTNAMES = ['eventor.orientering.se'];
const MANAGED_HOSTNAMES = ['orientering.liveidrott.se', 'www.livelox.com', 'livelox.com'];

function isManagedUrl(url: string): boolean {
  try {
    return MANAGED_HOSTNAMES.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isAlwaysBrowserUrl(url: string): boolean {
  try {
    return ALWAYS_BROWSER_HOSTNAMES.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

type ExternalLinkState = {
  askUrl: string | null;
  closeAsk: () => void;
  closeWebView: () => void;
  webViewUrl: string | null;
};

export const useExternalLinkStore = create<ExternalLinkState>((set) => ({
  askUrl: null,
  closeAsk: () => set({ askUrl: null }),
  closeWebView: () => set({ webViewUrl: null }),
  webViewUrl: null,
}));

/** Drop-in replacement for Linking.openURL for links that should respect the
 * "Externa länkar" setting (Fråga alltid / Öppna i appen / Öppna i webläsare). */
export function openExternalLink(url: string): void {
  if (isAlwaysBrowserUrl(url) || !isManagedUrl(url)) {
    void Linking.openURL(url);
    return;
  }

  const mode = usePreferencesStore.getState().externalLinkMode;

  if (mode === 'browser') {
    void Linking.openURL(url);
    return;
  }

  if (mode === 'app') {
    useExternalLinkStore.setState({ webViewUrl: url });
    return;
  }

  useExternalLinkStore.setState({ askUrl: url });
}
