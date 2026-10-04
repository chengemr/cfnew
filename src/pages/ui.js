import { isPersian } from './language.js';
import styles from './ui.css';

export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function scriptJSON(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function locale(request) {
  const fa = isPersian(request);
  return { fa, lang: fa ? 'fa-IR' : 'zh-CN', t: (zh, persian) => fa ? persian : zh };
}

export const logo = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m8 8 16 8-16 8V8Z" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="8" r="3" fill="currentColor"/><circle cx="24" cy="16" r="3" fill="currentColor"/><circle cx="8" cy="24" r="3" fill="currentColor"/></svg>`;

export function documentPage({ lang, fa, title, body, boot, client }) {
  return new Response(`<!DOCTYPE html>
<html lang="${lang}" dir="${fa ? 'rtl' : 'ltr'}" data-theme="dark">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="referrer" content="no-referrer">
<title>${escapeHTML(title)} · CFnew</title><style>${styles}</style></head>
<body>${body}<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script id="boot" type="application/json">${scriptJSON(boot)}</script>
<script>${client}</script></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }
  });
}
