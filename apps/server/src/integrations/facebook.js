// Đăng bài thật lên 1 Facebook Page qua Graph API (yêu cầu Page Access Token
// dài hạn của đúng Page, tạo qua developers.facebook.com > app > Page).
const GRAPH_VERSION = 'v21.0';

export const postToFacebookPage = async ({ message, imageUrl, linkUrl }) => {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) {
    throw new Error('Chưa cấu hình FACEBOOK_PAGE_ID/FACEBOOK_PAGE_ACCESS_TOKEN trong .env - xem .env.example.');
  }

  // Có ảnh -> đăng qua endpoint /photos (Facebook tự tải ảnh từ URL công
  // khai, không cần upload file nhị phân qua server này). Không ảnh -> đăng
  // text/link thường qua /feed.
  const endpoint = imageUrl ? `${pageId}/photos` : `${pageId}/feed`;
  const body = imageUrl
    ? { url: imageUrl, caption: message, access_token: accessToken }
    : { message, link: linkUrl || undefined, access_token: accessToken };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Đăng Facebook thất bại (mã ${res.status}): ${data?.error?.message || JSON.stringify(data).slice(0, 300)}`);
  }

  const postId = data.post_id || data.id;
  return { postId, permalink: `https://www.facebook.com/${postId}` };
};
