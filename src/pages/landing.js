import { documentPage, locale, logo } from './ui.js';
import client from './landing.client.js';

export function renderLanding(request, customPath = '') {
  const { fa, lang, t } = locale(request);
  const customPathMode = Boolean(String(customPath).trim());
  const body = `<div class="login-body">
  <header class="login-top"><a class="brand" href="/"><span class="brand-icon">${logo}</span><span><span class="brand-name">CFnew</span><span class="brand-caption">CONNECTION CONSOLE</span></span></a>
    <select id="languageSelector" class="language" aria-label="${t('语言', 'زبان')}"><option value="zh" ${fa ? '' : 'selected'}>中文</option><option value="fa" ${fa ? 'selected' : ''}>فارسی</option></select></header>
  <main class="login-wrap"><div class="login-card"><section class="login-intro">
    <p class="eyebrow">YOUR CONNECTION. YOUR CONTROL.</p><h1>${t('连接管理，<br>从这里开始。', 'مدیریت اتصال،<br>از اینجا شروع می‌شود.')}</h1>
    <p>${t('协议、优选节点与客户端订阅，集中管理。', 'پروتکل‌ها، نودهای ترجیحی و اشتراک در یک مکان.')}</p>
    <div class="login-lines"><span>VLESS · Trojan · XHTTP</span><span>${t('多客户端订阅格式', 'قالب‌های اشتراک چند کلاینت')}</span><span>${t('优选节点与连接配置', 'نودهای ترجیحی و تنظیمات اتصال')}</span></div>
  </section><form class="login-form" id="connectForm" novalidate><h2>${t('进入控制台', 'ورود به پنل')}</h2><p class="muted small">${t('使用现有部署的访问凭据。', 'از اطلاعات دسترسی استقرار فعلی استفاده کنید.')}</p>
    <div class="field"><label for="credential">${customPathMode ? t('管理路径（D）', 'مسیر مدیریت (D)') : t('访问 UUID（U）', 'UUID دسترسی (U)')}</label>
      <div class="secret-field"><input id="credential" type="password" class="mono" autocomplete="off" spellcheck="false" required placeholder="${customPathMode ? '/my/panel' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}"><button class="text-button" id="revealCredential" type="button">${t('显示', 'نمایش')}</button></div>
      <p class="hint">${customPathMode ? t('请输入你 D 变量的值，支持多级路径。', 'مقدار D را وارد کنید؛ مسیر چندسطحی پشتیبانی می‌شود.') : t('请输入部署时设置的 U 变量值。', 'مقدار U را وارد کنید.')}</p>
    </div><p id="connectError" class="error-text small" role="alert" hidden></p>
    <button type="submit" id="connectButton" class="btn primary">${t('进入控制台', 'ورود به پنل')} →</button>
  </form></div></main>
  <footer class="login-footer">CFnew v4.0.2 <span aria-hidden="true">·</span> <a href="https://github.com/byJoey/cfnew" rel="noreferrer noopener" target="_blank">${t('项目与文档', 'پروژه و مستندات')} ↗</a></footer></div>`;
  // The public entry page only needs the mode; the management credential stays
  // on the authenticated dashboard and is never embedded in the landing HTML.
  return documentPage({ lang, fa, title: t('连接管理', 'مدیریت اتصال'), body, client,
    boot: { fa, customPathMode } });
}
