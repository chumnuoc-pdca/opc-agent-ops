const KEY = 'opc-google-drive-settings';

// Both are plain user-provided config (a Google Cloud OAuth Client ID + API
// key from the user's own project), stored in localStorage like the AI
// settings - never a server-side secret since there is no server.
export const DEFAULT_DRIVE_SETTINGS = {
  clientId: '',
  apiKey: ''
};

export const loadGoogleDriveSettings = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return { ...DEFAULT_DRIVE_SETTINGS, ...JSON.parse(saved) };
  } catch {
    // corrupt/unavailable storage - fall back to defaults below
  }
  return { ...DEFAULT_DRIVE_SETTINGS };
};

export const saveGoogleDriveSettings = (settings) => {
  localStorage.setItem(KEY, JSON.stringify(settings));
};

export const isGoogleDriveConfigured = (settings) => Boolean(settings.clientId?.trim() && settings.apiKey?.trim());
