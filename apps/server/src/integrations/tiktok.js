// Đăng video thật lên TikTok qua Content Posting API, dùng luồng
// PULL_FROM_URL (TikTok tự tải video từ 1 URL công khai - khớp đúng cách
// generate_video lưu kết quả lên Google Drive rồi mở quyền xem công khai).
// Lưu ý thật quan trọng: app TikTok CHƯA qua audit chỉ đăng được ở chế độ
// private/self-only (privacy_level SELF_ONLY) - không tự ý đăng công khai
// thay người dùng khi chưa xác nhận app đã được duyệt Production.
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

export const postVideoToTikTok = async ({ videoUrl, caption, privacyLevel }) => {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Chưa cấu hình TIKTOK_ACCESS_TOKEN trong .env - xem .env.example.');
  }

  const res = await fetch(`${TIKTOK_API_BASE}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      post_info: {
        title: caption || '',
        privacy_level: privacyLevel || 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl
      }
    }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error?.code === 'error') {
    throw new Error(`Đăng TikTok thất bại (mã ${res.status}): ${data?.error?.message || JSON.stringify(data).slice(0, 300)}`);
  }

  return { publishId: data?.data?.publish_id || null, raw: data };
};
