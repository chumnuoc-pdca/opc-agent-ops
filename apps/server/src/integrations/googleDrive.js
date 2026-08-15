// Upload file thật lên Google Drive bằng service account (JWT, scope
// drive.file - chỉ đụng file do chính app tạo ra). Khác hẳn
// apps/web/src/utils/googleDrivePicker.js (luồng OAuth phía trình duyệt,
// scope readonly, cần người bấm chọn) - đây là luồng server-side để
// generate_image/generate_video (aiTools.js) tự lưu kết quả mà không cần ai
// thao tác tay.
import { readFileSync } from 'node:fs';
import { JWT } from 'google-auth-library';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let cachedClient = null;

const getJwtClient = () => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON trong .env - xem .env.example để biết cách tạo service account.');
  }
  if (cachedClient) return cachedClient;

  let credentials;
  try {
    credentials = raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(readFileSync(raw, 'utf8'));
  } catch (err) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON không đọc được (phải là đường dẫn tới file JSON key hoặc nội dung JSON key thật): ${err.message}`);
  }

  cachedClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [DRIVE_SCOPE]
  });
  return cachedClient;
};

// multipart/related upload (2 phần: metadata JSON + nội dung file thật) -
// đúng chuẩn Drive API v3, không cần thêm SDK Drive riêng vì chỉ cần 1 lệnh
// upload + 1 lệnh mở quyền xem công khai.
export const uploadBufferToDrive = async ({ buffer, filename, mimeType }) => {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('Chưa cấu hình GOOGLE_DRIVE_FOLDER_ID trong .env - không biết lưu file vào thư mục Drive nào.');
  }

  const client = getJwtClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Không lấy được access token từ Google service account - kiểm tra lại GOOGLE_SERVICE_ACCOUNT_JSON.');

  const boundary = `opc-drive-upload-${Date.now()}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, 'utf8')
  ]);

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartBody,
    signal: AbortSignal.timeout(30000)
  });
  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => '');
    throw new Error(`Upload Google Drive thất bại (mã ${uploadRes.status}). ${detail.slice(0, 300)}`);
  }
  const uploaded = await uploadRes.json();

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    signal: AbortSignal.timeout(15000)
  });
  if (!permRes.ok) {
    const detail = await permRes.text().catch(() => '');
    throw new Error(`Đã upload file lên Drive (id ${uploaded.id}) nhưng không mở được quyền xem công khai (mã ${permRes.status}). ${detail.slice(0, 300)}`);
  }

  return { fileId: uploaded.id, webViewLink: uploaded.webViewLink };
};
