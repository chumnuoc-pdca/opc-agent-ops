const KEY = 'opc-chat-sessions';

export const loadSessions = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // corrupt/unavailable storage - start fresh below
  }
  return [];
};

export const saveSessions = (sessions) => {
  localStorage.setItem(KEY, JSON.stringify(sessions));
};

export const createSession = () => ({
  id: `chat-${Date.now()}`,
  title: 'Cuộc trò chuyện mới',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: []
});

// The first user message becomes the session title (trimmed), so the list is
// scannable without the user having to rename every chat manually.
export const deriveTitle = (content) => {
  const clean = content.trim().replace(/\s+/g, ' ');
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
};
