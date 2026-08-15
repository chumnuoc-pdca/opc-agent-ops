const jsonFetch = async (url, options) => {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
};

export const checkSession = () => jsonFetch('/api/auth/me');

export const login = (password) =>
  jsonFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });

export const logout = () => jsonFetch('/api/auth/logout', { method: 'POST' });
