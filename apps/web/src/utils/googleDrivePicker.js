// Loads Google's Identity Services (OAuth) + Picker API scripts on demand and
// wraps them in promises, so the rest of the app never touches `window.google`
// directly. Real Drive browsing needs the user's own Google Cloud OAuth
// Client ID + API key (configured in Settings) - there is no backend here to
// hide a client secret behind, so this only ever requests the minimal
// `drive.readonly` scope via the browser-side token flow.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let dependenciesPromise = null;
let cachedToken = null; // { accessToken, expiresAt, clientId }

const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) {
    resolve();
    return;
  }
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.defer = true;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error(`Không tải được script: ${src}`));
  document.head.appendChild(script);
});

const loadGooglePickerDependencies = () => {
  if (!dependenciesPromise) {
    dependenciesPromise = Promise.all([
      loadScript('https://accounts.google.com/gsi/client'),
      loadScript('https://apis.google.com/js/api.js').then(
        () => new Promise((resolve) => window.gapi.load('picker', resolve))
      )
    ]);
  }
  return dependenciesPromise;
};

const requestAccessToken = (clientId) => new Promise((resolve, reject) => {
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > Date.now() + 30000) {
    resolve(cachedToken.accessToken);
    return;
  }
  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        cachedToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in || 3600) * 1000,
          clientId
        };
        resolve(response.access_token);
      },
      error_callback: (err) => reject(new Error(err?.type || 'Đăng nhập Google thất bại')),
    });
    tokenClient.requestAccessToken({ prompt: '' });
  } catch (e) {
    reject(e);
  }
});

// Opens the real Google Drive file picker. Resolves once the picker is shown;
// `onPicked` fires asynchronously for each file the user actually selects.
export const openGoogleDrivePicker = async ({ clientId, apiKey, onPicked }) => {
  if (!clientId || !apiKey) {
    throw new Error('Chưa cấu hình Google Drive (Client ID / API Key) trong Cài đặt.');
  }
  await loadGooglePickerDependencies();
  const accessToken = await requestAccessToken(clientId);

  const view = new window.google.picker.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);

  const picker = new window.google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .setCallback((data) => {
      if (data.action === window.google.picker.Action.PICKED) {
        (data.docs || []).forEach((doc) => {
          onPicked({
            id: doc.id,
            name: doc.name,
            url: doc.url,
            iconUrl: doc.iconUrl,
            mimeType: doc.mimeType
          });
        });
      }
    })
    .build();

  picker.setVisible(true);
};
