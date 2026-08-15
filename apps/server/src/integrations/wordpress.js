// Đăng bài thật lên WordPress qua REST API, xác thực bằng Application
// Password (Users > Profile > Application Passwords trên site đích -
// KHÔNG dùng mật khẩu đăng nhập thường).
export const publishWordpressPost = async ({ title, contentHtml, status }) => {
  const siteUrl = process.env.WORDPRESS_SITE_URL;
  const username = process.env.WORDPRESS_APP_USERNAME;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;
  if (!siteUrl || !username || !appPassword) {
    throw new Error('Chưa cấu hình WORDPRESS_SITE_URL/WORDPRESS_APP_USERNAME/WORDPRESS_APP_PASSWORD trong .env - xem .env.example.');
  }

  const basicAuth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const res = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title,
      content: contentHtml,
      status: status || 'draft'
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Đăng WordPress thất bại (mã ${res.status}): ${data?.message || JSON.stringify(data).slice(0, 300)}`);
  }

  return { postId: data.id, link: data.link, status: data.status };
};
