// A small, dependency-free Markdown renderer for chat messages.
//
// Everything is escaped *before* any markup is produced, so raw HTML in model
// output, web pages or user input can never become live markup. Only the tags
// built here reach the DOM, and link protocols are restricted to http(s).

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;
const placeholder = index => `\u0000block${index}\u0000`;

function safeHref(url) {
  const trimmed = String(url).trim();
  return SAFE_PROTOCOL.test(trimmed) ? escapeHtml(trimmed) : null;
}

// Inline markup runs on already-escaped text.
function inline(text) {
  let out = text;
  out = out.replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  out = out.replace(/\[([^\]\n]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (match, label, url) => {
    const href = safeHref(url);
    return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });
  out = out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<>()]+[^\s<>().,;:!?])/g, (match, lead, url) => `${lead}<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  return out;
}

function list(lines) {
  const ordered = /^\s*\d+[.)]\s/.test(lines[0]);
  const items = lines.map(line => `<li>${inline(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())}</li>`).join('');
  return `<${ordered ? 'ol' : 'ul'}>${items}</${ordered ? 'ol' : 'ul'}>`;
}

export function renderMarkdown(source) {
  const text = escapeHtml(String(source ?? '').replace(/\r\n?/g, '\n')).replace(/\u0000/g, '');
  const blocks = [];
  const store = html => placeholder(blocks.push(html) - 1);
  const fenced = text.replace(/```([\w+#.-]*)\n([\s\S]*?)(?:```|$)/g, (_, language, code) => store(`<pre class="md-code"${language ? ` data-language="${language}"` : ''}><code>${code.replace(/\n$/, '')}</code></pre>`));
  const lines = fenced.split('\n');
  const out = [];
  let paragraph = [];
  let bullets = [];
  const flushParagraph = () => { if (paragraph.length) { out.push(`<p>${inline(paragraph.join('<br>'))}</p>`); paragraph = []; } };
  const flushList = () => { if (bullets.length) { out.push(list(bullets)); bullets = []; } };
  for (const line of lines) {
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    if (/^\u0000block\d+\u0000$/.test(line.trim())) { flushParagraph(); flushList(); out.push(line.trim()); continue; }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) { flushParagraph(); bullets.push(line); continue; }
    flushList();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { flushParagraph(); const level = Math.min(6, heading[1].length + 2); out.push(`<h${level} class="md-heading">${inline(heading[2].trim())}</h${level}>`); continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushParagraph(); out.push('<hr class="md-rule">'); continue; }
    const quote = line.match(/^&gt;\s?(.*)$/);
    if (quote) { flushParagraph(); out.push(`<blockquote>${inline(quote[1].trim())}</blockquote>`); continue; }
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList();
  return out.join('').replace(/\u0000block(\d+)\u0000/g, (_, index) => blocks[Number(index)] || '');
}
