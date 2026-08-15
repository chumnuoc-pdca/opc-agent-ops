import React, { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

marked.setOptions({ breaks: true });

// Renders AI/user chat content as sanitized markdown, syntax-highlights code
// blocks, and injects a "Copy" button per block. DOMPurify runs on the parsed
// HTML before it ever reaches dangerouslySetInnerHTML since this content
// comes from an external API and must be treated as untrusted.
export default function MarkdownMessage({ content }) {
  const containerRef = useRef(null);

  const html = useMemo(() => {
    const raw = marked.parse(content || '');
    return DOMPurify.sanitize(raw);
  }, [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const cleanupFns = [];
    container.querySelectorAll('pre code').forEach(codeEl => {
      hljs.highlightElement(codeEl);
      const pre = codeEl.parentElement;
      if (!pre || pre.querySelector('.code-copy-btn')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      const handleClick = () => {
        navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
          btn.textContent = 'Đã copy!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
      };
      btn.addEventListener('click', handleClick);
      pre.appendChild(btn);
      cleanupFns.push(() => btn.removeEventListener('click', handleClick));
    });

    return () => cleanupFns.forEach(fn => fn());
  }, [html]);

  return <div ref={containerRef} className="chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
