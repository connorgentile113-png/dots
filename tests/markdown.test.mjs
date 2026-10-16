import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, escapeHtml } from '../src/markdown.js';

test('raw HTML in any message is escaped, never rendered', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> and <script>alert(2)</script>');
  assert.ok(!html.includes('<img'), 'images must never be produced');
  assert.ok(!html.includes('<script'), 'scripts must never be produced');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
});

test('headings, emphasis, inline code and lists render as markup', () => {
  const html = renderMarkdown('# Title\n\nA paragraph with **bold**, *italic* and `code`.\n\n- first\n- second\n\n1. one\n2. two');
  assert.match(html, /<h3 class="md-heading">Title<\/h3>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>first<\/li><li>second<\/li><\/ul>/);
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
});

test('fenced code blocks keep their language and stay one block', () => {
  const html = renderMarkdown('Before\n\n```js\nconst a = 1;\n\nconsole.log(a);\n```\n\nAfter');
  assert.match(html, /<pre class="md-code" data-language="js"><code>const a = 1;\n\nconsole\.log\(a\);<\/code><\/pre>/);
  assert.match(html, /<p>Before<\/p>/);
  assert.match(html, /<p>After<\/p>/);
});

test('only http, https and mailto links become anchors', () => {
  assert.match(renderMarkdown('[site](https://example.com/a?b=1)'), /<a href="https:\/\/example\.com\/a\?b=1" target="_blank" rel="noopener noreferrer">site<\/a>/);
  const unsafe = renderMarkdown('[click](javascript:alert(1)) and [file](file:///etc/passwd)');
  assert.ok(!/href="javascript/.test(unsafe), 'javascript: must not survive');
  assert.ok(!/href="file:/.test(unsafe), 'file: must not survive');
  assert.match(unsafe, /click/);
  assert.match(renderMarkdown('See https://example.com/docs for details'), /<a href="https:\/\/example\.com\/docs"/);
});

test('quotes, rules and line breaks behave predictably', () => {
  const html = renderMarkdown('> quoted advice\n\n---\n\nfirst line\nsecond line');
  assert.match(html, /<blockquote>quoted advice<\/blockquote>/);
  assert.match(html, /<hr class="md-rule">/);
  assert.match(html, /<p>first line<br>second line<\/p>/);
});

test('markdown never leaks a placeholder when blocks are mixed', () => {
  const html = renderMarkdown('Text\n```\nplain\n```\nText\n**bold**');
  assert.ok(!html.includes('block0'), 'placeholders must be substituted');
  assert.match(html, /<pre class="md-code"><code>plain<\/code><\/pre>/);
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(null), '');
});
