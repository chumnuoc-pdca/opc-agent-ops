// Markdown nhẹ, tự viết bằng regex - KHÔNG thêm thư viện editor/markdown mới
// (xem plan Phase 13: "không kéo thêm dependency nặng", đúng tinh thần đã áp
// dụng cho fetch_news_by_keyword ở Phase 7). Hỗ trợ vừa đủ heading/list/
// checkbox/code/bold/italic/link cho ghi chú kiểu Notion đơn giản.
//
// QUAN TRỌNG về an toàn: escape HTML của nội dung thô TRƯỚC, rồi mới áp cú
// pháp markdown lên bản đã escape - nội dung người dùng gõ literal <script>
// hay onerror=... sẽ luôn thành text trơ, không bao giờ thành thẻ HTML thật.
const escapeHtml = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const renderInline = (text) => text
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

export const renderMarkdownLite = (raw) => {
  const escaped = escapeHtml(raw || '');
  const lines = escaped.split('\n');
  const html = [];
  let inCodeBlock = false;
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      html.push(`<ul>${listBuffer.join('')}</ul>`);
      listBuffer = [];
    }
  };

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      flushList();
      inCodeBlock = !inCodeBlock;
      html.push(inCodeBlock ? '<pre><code>' : '</code></pre>');
      return;
    }
    if (inCodeBlock) {
      html.push(`${line}\n`);
      return;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    const checkboxMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);

    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
    } else if (checkboxMatch) {
      const done = checkboxMatch[1].toLowerCase() === 'x';
      listBuffer.push(`<li class="md-checkbox ${done ? 'done' : ''}"><span>${done ? '☑' : '☐'}</span> ${renderInline(checkboxMatch[2])}</li>`);
    } else if (bulletMatch) {
      listBuffer.push(`<li>${renderInline(bulletMatch[1])}</li>`);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      html.push(`<p>${renderInline(line)}</p>`);
    }
  });
  flushList();
  if (inCodeBlock) html.push('</code></pre>');

  return html.join('\n');
};
