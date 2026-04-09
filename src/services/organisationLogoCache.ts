import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const logoCache = new Map<string, string | null>();
const inflightDownloads = new Map<string, Promise<string | null>>();

function getCacheFileUri(organisationId: string) {
  const safeId = organisationId.replace(/[^0-9A-Za-z_-]/g, '_');
  const baseDirectory = FileSystem.cacheDirectory ?? '';
  return `${baseDirectory}organisationlogos/${safeId}.png`;
}

async function ensureCacheDirectory() {
  const baseDirectory = FileSystem.cacheDirectory;

  if (!baseDirectory) {
    return null;
  }

  const directoryUri = `${baseDirectory}organisationlogos/`;

  try {
    await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  } catch {
    // Directory may already exist or cannot be created. We can still try the download.
  }

  return directoryUri;
}

export async function getOrganisationLogoUri(organisationId?: string | null) {
  if (!organisationId) {
    return null;
  }

  const cached = logoCache.get(organisationId);
  if (cached !== undefined) {
    return cached;
  }

  const inFlight = inflightDownloads.get(organisationId);
  if (inFlight) {
    return inFlight;
  }

  const downloadPromise = (async () => {
    if (Platform.OS === 'web') {
      const remoteUri = getRemoteOrganisationLogoUri(organisationId);
      logoCache.set(organisationId, remoteUri);
      return remoteUri;
    }

    const cacheDirectory = await ensureCacheDirectory();
    if (!cacheDirectory) {
      logoCache.set(organisationId, null);
      return null;
    }

    const fileUri = getCacheFileUri(organisationId);

    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        logoCache.set(organisationId, fileUri);
        return fileUri;
      }

      const remoteUri = getRemoteOrganisationLogoUri(organisationId);
      const downloadResult = await FileSystem.downloadAsync(remoteUri, fileUri);
      if (downloadResult.status === 200) {
        logoCache.set(organisationId, downloadResult.uri);
        return downloadResult.uri;
      }
    } catch {
      // Fall through to null fallback below.
    }

    logoCache.set(organisationId, null);
    return null;
  })();

  inflightDownloads.set(organisationId, downloadPromise);

  try {
    return await downloadPromise;
  } finally {
    inflightDownloads.delete(organisationId);
  }
}

export function getRemoteOrganisationLogoUri(organisationId: string) {
  return `https://eventorsverige.blob.core.windows.net/organisationlogos/${organisationId}/InlineIcon.png`;
}
