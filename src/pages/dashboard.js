import { defaults } from '../config.js';
import { documentPage, escapeHTML as html, locale, logo } from './ui.js';
import { ranges, datacenters } from './probe-data.js';
import client from './dashboard.client.js';

const clients = [
  ['clash', 'Clash / Meta', 'C', '#8cbef6', 'YAML', 'clash://install-config?url='],
  ['clash', 'Stash', 'S', '#bcb1ee', 'YAML', 'stash://install?url='],
  ['surge', 'Surge', 'S', '#85caee', 'INI', 'surge:///install-config?url='],
  ['singbox', 'sing-box', 's', '#ddb577', 'JSON', 'sing-box://install-config?url='],
  ['loon', 'Loon', 'L', '#c5b8ef', 'INI', 'loon://install?url='],
  ['quanx', 'Quantumult X', 'Q', '#f0a5b6', 'INI', 'quantumult-x:///install-config?url='],
  ['', 'V2Ray', 'V', '#89cbb7', 'BASE64', ''],
  ['', 'V2rayNG', 'V', '#89cbb7', 'BASE64', 'v2rayng://install?url='],
  ['', 'NekoRay', 'N', '#adbada', 'BASE64', 'nekoray://install-config?url='],
  ['', 'Shadowrocket', 'S', '#97b9cc', 'BASE64', 'shadowrocket://add/'],
  ['vg', 'Clash 家宽', '↗', '#64dbc0', 'YAML', 'clash://install-config?url=']
];

function icon(name) {
  const paths = {
    subscription: '<path d="M7 7h10v14H7zM10 3h10v14M10 11h4M10 15h4"/>',
    config: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
    preferred: '<path d="m3 16 5-5 4 3 8-9M14 5h6v6"/>',
    advanced: '<path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18"/>',
    region: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
    storage: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>',
    route: '<path d="M4 20V4M4 12h9l5-6M13 12l5 6M15 6h4v4M15 18h4v-4"/>',
    theme: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function renderDashboard(request, token, { config = defaults, kvEnabled = false } = {}) {
  const { fa, lang, t } = locale(request);
  const titles = {
    subscription: t('订阅中心', 'مرکز اشتراک'), config: t('连接配置', 'تنظیمات اتصال'),
    preferred: t('优选节点', 'نودهای ترجیحی'), advanced: t('高级设置', 'تنظیمات پیشرفته')
  };
  const descriptions = {
    subscription: t('选择客户端，复制订阅，即刻开始。', 'کلاینت را انتخاب و لینک اشتراک را کپی کنید.'),
    config: t('管理协议与出站连接，保存后生效。', 'پروتکل و اتصال خروجی را تنظیم و ذخیره کنید.'),
    preferred: t('管理节点来源，按需筛选与测试。', 'منبع نودها را مدیریت، فیلتر و آزمایش کنید.'),
    advanced: t('调整订阅行为与访问选项。', 'رفتار اشتراک و گزینه‌های دسترسی را تنظیم کنید.')
  };
  const field = (key, label, hint = '', { type = 'text', placeholder = '', options, rows } = {}) => {
    const control = options ? `<select id="${key}" data-config="${key}">${options.map(([value, text]) => `<option value="${html(value)}">${html(text)}</option>`).join('')}</select>`
      : rows ? `<textarea id="${key}" data-config="${key}" rows="${rows}" class="mono" spellcheck="false" placeholder="${html(placeholder)}"></textarea>`
      : `<input id="${key}" data-config="${key}" type="${type}" class="mono" autocomplete="off" spellcheck="false" placeholder="${html(placeholder)}">`;
    return `<div class="field"><label for="${key}">${html(label)} <code>${key}</code></label>${type === 'password' ? `<div class="secret-field">${control}<button type="button" class="text-button" data-reveal="${key}">${t('显示', 'نمایش')}</button></div>` : control}${hint ? `<p class="hint">${html(hint)}</p>` : ''}</div>`;
  };
  const toggle = (key, label, hint) => `<label class="switch" for="${key}"><span><strong>${html(label)}</strong><small>${html(hint)}</small></span><input type="checkbox" id="${key}" data-config="${key}" aria-label="${html(label)}"></label>`;
  const heading = (title, description, right = '') => `<div class="card-heading"><div><h2>${html(title)}</h2><p>${html(description)}</p></div>${right}</div>`;
  const body = `
<a class="skip-link" href="#main">${t('跳转到内容', 'رفتن به محتوا')}</a>
<aside class="sidebar">
  <a class="brand" href="#subscription"><span class="brand-icon">${logo}</span><span><span class="brand-name">CFnew</span><span class="brand-caption">CONNECTION CONSOLE</span></span></a>
  <p class="nav-caption">${t('工作空间', 'فضای کار')}</p>
  <nav class="nav" aria-label="${t('主导航', 'ناوبری اصلی')}">${Object.entries(titles).map(([id, title]) => `<a href="#${id}" data-nav="${id}">${icon(id)}<span>${title}</span></a>`).join('')}</nav>
  <div class="sidebar-footer"><a href="https://github.com/byJoey/cfnew" target="_blank" rel="noopener noreferrer">${t('项目与文档', 'پروژه و مستندات')} ↗</a><span class="version">v3.1 · UI 2026.10</span></div>
</aside>
<div class="shell">
  <header class="topbar"><div class="breadcrumb"><span>CFnew</span><span>/</span><strong id="breadcrumb">${titles.subscription}</strong></div>
  <div class="toolbar"><span class="badge" id="configBadge">${t('配置已读取', 'تنظیمات خوانده شد')}</span>
    <button type="button" id="themeToggle" class="icon-button" aria-label="${t('切换外观', 'تغییر ظاهر')}" title="${t('切换外观', 'تغییر ظاهر')}">${icon('theme')}</button>
    <select id="languageSelector" class="language" aria-label="${t('语言', 'زبان')}"><option value="zh" ${fa ? '' : 'selected'}>中文</option><option value="fa" ${fa ? 'selected' : ''}>فارسی</option></select></div>
  </header>
  <main id="main" class="content">
    <div class="page-heading"><div><h1 id="pageTitle">${titles.subscription}</h1><p id="pageDescription" class="muted">${descriptions.subscription}</p></div><button class="btn" id="refreshConfig" type="button">↻ ${t('刷新配置', 'تازه‌سازی تنظیمات')}</button></div>
    <div id="kvNotice" class="notice warning" ${kvEnabled ? 'hidden' : ''}>${t('当前使用环境变量配置。未绑定 KV（C），此页面暂不能保存更改；订阅仍可使用。', 'بدون اتصال KV (C) ذخیره ممکن نیست؛ اشتراک همچنان قابل استفاده است.')}</div>
    <section data-panel="subscription" aria-label="${titles.subscription}">
      <div class="metrics">
        <div class="metric"><div class="metric-top">${t('运行地区', 'منطقه اجرا')}${icon('region')}</div><strong id="regionMetric">—</strong><p id="regionCaption">${t('读取地区信息', 'خواندن منطقه')}</p></div>
        <div class="metric"><div class="metric-top">${t('已启用协议', 'پروتکل‌های فعال')}${icon('config')}</div><strong id="protocolMetric">—</strong><p id="protocolCaption">—</p></div>
        <div class="metric"><div class="metric-top">${t('出站策略', 'مسیر خروجی')}${icon('route')}</div><strong id="routeMetric">—</strong><p id="routeCaption">—</p></div>
        <div class="metric"><div class="metric-top">${t('配置存储', 'ذخیره تنظیمات')}${icon('storage')}</div><strong id="storageMetric">${kvEnabled ? 'KV' : 'ENV'}</strong><p id="storageCaption">${kvEnabled ? t('绑定已识别', 'اتصال شناسایی شد') : t('使用环境变量', 'متغیرهای محیطی')}</p></div>
      </div>
      <div class="card hero-card">${heading(t('你的连接，由你掌控。', 'اتصال شما، در اختیار شما.'), t('协议、节点与订阅，集中管理。', 'پروتکل‌ها، نودها و اشتراک در یک مکان.'), `<span class="orb">${icon('route')}</span>`)}</div>
      <div class="card">${heading(t('选择你的客户端', 'کلاینت خود را انتخاب کنید'), t('所有格式由当前 Worker 生成。', 'همه قالب‌ها توسط Worker فعلی تولید می‌شوند.'), '<span class="step">01 / CLIENT</span>')}
        <div class="clients" role="group" aria-label="${t('订阅客户端', 'کلاینت اشتراک')}">${clients.map(([, name, mark, color, format], index) => `<label class="client" id="client-${index}" ${index === 10 ? 'hidden' : ''}><input type="radio" name="client" value="${index}" ${index === 0 ? 'checked' : ''}><span class="client-logo" style="--logo-color:${color}">${mark}</span><span><span class="client-name">${html(name)}</span><span class="client-type">${format}</span></span></label>`).join('')}</div>
        <div class="subscription-area"><div class="label-row"><label for="subscriptionUrl">${t('你的订阅链接', 'لینک اشتراک شما')}</label><button type="button" class="text-button" data-reveal="subscriptionUrl">${t('显示', 'نمایش')}</button></div>
          <div class="link-row"><input id="subscriptionUrl" type="password" class="mono" readonly aria-label="${t('订阅链接', 'لینک اشتراک')}"><button id="copySubscription" type="button" class="btn primary">${t('复制链接', 'کپی لینک')}</button><a id="importSubscription" class="btn" href="#">${t('导入客户端', 'ورود به کلاینت')} ↗</a></div>
          <div class="link-actions"><p class="hint">${t('链接包含访问凭据，请在自己的客户端使用。', 'لینک شامل اطلاعات دسترسی است؛ در کلاینت خود استفاده کنید.')}</p><button id="downloadSubscription" type="button" class="text-button">↓ ${t('下载配置', 'دانلود تنظیمات')}</button></div>
        </div>
      </div>
      <div class="card">${heading(t('连接概览', 'نمای اتصال'), t('展示已保存的配置与地区信息。', 'نمایش تنظیمات ذخیره‌شده و اطلاعات منطقه.'), `<button class="text-button" id="refreshStatus" type="button">↻ ${t('刷新', 'تازه‌سازی')}</button>`)}
        <dl class="details-list"><div><dt>${t('地区来源', 'منبع منطقه')}</dt><dd id="regionSource">—</dd></div><div><dt>ProxyIP</dt><dd id="proxyStatus">—</dd></div><div><dt>${t('上游代理', 'پروکسی بالادست')}</dt><dd id="upstreamStatus">—</dd></div><div><dt>ECH / TLS</dt><dd id="echStatus">—</dd></div></dl>
        <p class="note">${t('地区与配置状态不代表节点已连通，实际连接以客户端测试为准。', 'منطقه و وضعیت تنظیمات به معنی اتصال نود نیست؛ در کلاینت آزمایش کنید.')}</p>
      </div>
    </section>
    <form id="configForm" novalidate><fieldset id="configFields" ${kvEnabled ? '' : 'disabled'}>
      <section data-panel="config" hidden aria-label="${titles.config}">
        <div class="grid"><div class="card">${heading(t('传输协议', 'پروتکل انتقال'), t('至少保留一种协议。', 'حداقل یک پروتکل فعال باشد.'))}
          <div class="switch-group">${toggle('ev', 'VLESS', 'WebSocket')}${toggle('et', 'Trojan', 'WebSocket / SHA224')}${toggle('ex', 'XHTTP', 'HTTP POST')}</div>
          ${field('tp', t('Trojan 密码', 'رمز Trojan'), t('留空时使用 UUID。', 'خالی: UUID.'), { type: 'password', placeholder: t('默认使用 UUID', 'پیش‌فرض: UUID') })}
          ${field('alpn', 'TLS ALPN', t('仅添加到 TLS 节点参数，留空由客户端协商。', 'فقط برای TLS؛ خالی: توافق کلاینت.'), { options: [['', t('自动协商', 'مذاکره خودکار')], ...['h3','h2','http/1.1','h3,h2','h2,http/1.1','h3,h2,http/1.1'].map(v => [v, v])] })}
        </div><div class="card">${heading(t('出站连接', 'اتصال خروجی'), t('沿用现有代理与回退配置。', 'استفاده از پروکسی و مسیر جایگزین فعلی.'))}
          ${field('s', t('上游代理', 'پروکسی بالادست'), t('支持 SOCKS5、HTTP 与 HTTPS。格式：用户名:密码@主机:端口。', 'SOCKS5، HTTP و HTTPS. قالب: user:password@host:port.'), { type: 'password', placeholder: 'user:password@host:1080' })}
          ${field('qj', t('出站策略', 'مسیر خروجی'), t('仅代理模式要求有效上游代理，失败时不回落到直连。', 'فقط پروکسی نیازمند پروکسی معتبر است و به مستقیم برنمی‌گردد.'), { options: [['', t('优先代理', 'اولویت پروکسی')], ['no', t('优先直连，失败后代理', 'ابتدا مستقیم، سپس پروکسی')], ['only', t('仅走代理', 'فقط پروکسی')]] })}
          ${field('p', 'ProxyIP', t('设置自定义回退地址后，地区选择不可编辑。', 'با آدرس جایگزین سفارشی انتخاب منطقه غیرفعال است.'), { placeholder: 'proxy.example.com:443' })}
          ${field('wk', t('指定地区', 'انتخاب منطقه'), '', { options: [['', t('自动 / 官方直连', 'خودکار / مستقیم')], ...[['HK','香港','هنگ‌کنگ'],['US','美国','آمریکا'],['SG','新加坡','سنگاپور'],['JP','日本','ژاپن'],['KR','韩国','کره'],['DE','德国','آلمان'],['SE','瑞典','سوئد'],['NL','荷兰','هلند'],['FI','芬兰','فنلاند'],['GB','英国','بریتانیا']].map(([id, zh, persian]) => [id, `${id} · ${t(zh, persian)}`])] })}
        </div></div>
        <div class="card" style="margin-top:20px">${heading(t('DNS 与加密', 'DNS و رمزنگاری'), t('与当前订阅生成逻辑保持一致。', 'مطابق منطق تولید اشتراک فعلی.'))}
          <div class="switch-group">${toggle('ech', t('启用 ECH', 'فعال‌سازی ECH'), t('从 DoH 获取 ECH 配置，同时强制仅生成 TLS 节点。', 'دریافت ECH از DoH و فقط نودهای TLS.'))}</div>
          <div class="field-row">${field('customDNS', t('DoH 服务器', 'سرور DoH'), t('用于 ECH 查询及 Clash 主 DNS。', 'برای ECH و DNS اصلی Clash.'), { placeholder: defaults.customDNS })}${field('customECHDomain', t('ECH 域名', 'دامنه ECH'), '', { placeholder: defaults.customECHDomain })}</div>
        </div>
      </section>
      <section data-panel="preferred" hidden aria-label="${titles.preferred}">
        <div class="card">${heading(t('自定义优选列表', 'لیست ترجیحی سفارشی'), t('支持域名、IPv4、IPv6 与显式端口。', 'دامنه، IPv4، IPv6 و پورت مشخص پشتیبانی می‌شوند.'))}
          ${field('yx', t('节点地址', 'آدرس نودها'), t('逗号或换行分隔。示例：example.com:8443#节点名、[2001:db8::1]:443#IPv6。', 'با کاما یا خط جدید جدا کنید: example.com:8443#name یا [2001:db8::1]:443#IPv6.'), { rows: 5, placeholder: 'example.com:8443#节点名\n[2001:db8::1]:443#IPv6' })}
          ${field('yxURL', t('优选来源 URL', 'URL منبع ترجیحی'), t('生成订阅时读取远程优选来源。', 'منبع راه دور هنگام تولید اشتراک خوانده می‌شود.'), { placeholder: 'https://example.com/ips.txt' })}
        </div>
        <div class="grid"><div class="card">${heading(t('节点来源', 'منابع نودها'), t('选择订阅包含的节点类型。', 'انواع نودهای اشتراک را انتخاب کنید.'))}<div>${toggle('epd', t('内置优选域名', 'دامنه‌های داخلی'), t('使用内置域名列表。', 'فهرست داخلی.'))}${toggle('epi', t('内置优选 IP', 'IPهای داخلی'), t('使用内置 IP 来源。', 'منابع IP داخلی.'))}${toggle('egi', t('自定义优选', 'منبع ترجیحی سفارشی'), t('使用自定义优选列表及远程来源。', 'فهرست سفارشی و راه دور.'))}${toggle('ena', t('原生地址', 'آدرس اصلی'), t('包含当前部署域名。', 'دامنه استقرار فعلی.'))}</div></div>
        <div class="card">${heading(t('地址筛选', 'فیلتر آدرس‌ها'), t('用于远程优选来源。', 'برای منابع راه دور.'))}<div>${toggle('ipv4', 'IPv4', t('保留 IPv4 地址。', 'نگه‌داشتن IPv4.'))}${toggle('ipv6', 'IPv6', t('保留 IPv6 地址。', 'نگه‌داشتن IPv6.'))}${toggle('ispMobile', t('中国移动', 'China Mobile'), '')}${toggle('ispUnicom', t('中国联通', 'China Unicom'), '')}${toggle('ispTelecom', t('中国电信', 'China Telecom'), '')}</div></div></div>
      </section>
      <section data-panel="advanced" hidden aria-label="${titles.advanced}">
        <div class="grid"><div class="card">${heading(t('访问与页面', 'دسترسی و صفحه'), t('修改管理路径后，订阅链接同步更新。', 'با تغییر مسیر مدیریت، لینک اشتراک به‌روز می‌شود.'))}
          ${field('d', t('管理路径', 'مسیر مدیریت'), t('例如 /my/panel。留空移除 KV 覆盖，回到环境变量或 UUID 路径。', 'مانند /my/panel. خالی: محیط یا UUID.'), { placeholder: '/my/panel' })}
          ${field('homepage', t('自定义首页', 'صفحه اصلی سفارشی'), t('根路径显示指定 URL 的内容，留空恢复环境变量或默认入口。', 'محتوای URL در مسیر اصلی؛ خالی: محیط یا ورودی پیش‌فرض.'), { placeholder: 'https://example.com' })}
          ${field('ae', t('优选 API 管理', 'مدیریت API ترجیحی'), '', { options: [['', t('默认关闭', 'پیش‌فرض: غیرفعال')], ['yes', t('开启', 'فعال')]] })}
        </div><div class="card">${heading(t('订阅选项', 'گزینه‌های اشتراک'), t('控制节点生成与地区匹配。', 'تولید نودها و تطبیق منطقه.'))}
          ${field('dkby', t('TLS 节点', 'نودهای TLS'), t('ECH 开启时固定为“仅 TLS”。', 'با ECH فقط TLS.'), { options: [['no', t('全部节点', 'همه نودها')], ['yes', t('仅 TLS', 'فقط TLS')]] })}
          ${field('yxby', t('优选控制', 'کنترل ترجیحی'), '', { options: [['', t('启用优选', 'فعال')], ['yes', t('关闭优选，仅原生地址', 'غیرفعال؛ فقط اصلی')]] })}
          ${field('rm', t('地区匹配', 'تطبیق منطقه'), '', { options: [['', t('启用地区匹配', 'فعال')], ['no', t('关闭地区匹配', 'غیرفعال')]] })}
          ${field('scu', t('订阅转换地址', 'آدرس تبدیل اشتراک'), t('保留兼容配置；客户端格式由内部生成器生成。', 'برای سازگاری حفظ شده؛ قالب‌ها داخلی تولید می‌شوند.'), { placeholder: defaults.scu })}
        </div></div>
        <div class="card" style="margin-top:20px">${heading(t('家宽链式', 'زنجیره مسکونی'), t('保存开启后显示独立的 Clash 家宽订阅。', 'پس از ذخیره اشتراک مسکونی نمایش داده می‌شود.'))}${toggle('jk', t('启用家宽链式订阅', 'اشتراک مسکونی'), t('需要兼容的 Mihomo 内核；共享节点可用性随来源变化。', 'نیازمند Mihomo سازگار؛ نودهای اشتراکی متغیرند.'))}</div>
        <div class="card">${heading(t('恢复配置', 'بازنشانی تنظیمات'), t('移除页面管理的 KV 配置，恢复环境变量与默认设置。', 'حذف تنظیمات KV صفحه و بازگشت به محیط و پیش‌فرض‌ها.'))}<button type="button" id="resetConfig" class="btn danger">${t('重置配置', 'بازنشانی')}</button></div>
      </section>
    </fieldset></form>
    <section id="probePanel" data-extra-panel="preferred" hidden class="card">
      ${heading(t('端点延迟测试', 'آزمایش تأخیر نقطه اتصال'), t('保留原有浏览器探测方式；结果不等于代理节点握手或吞吐量。', 'آزمایش مرورگر؛ نتیجه معادل اتصال یا سرعت پروکسی نیست.'))}
      <div class="field-row"><div class="field"><label for="ipSource">${t('地址来源', 'منبع آدرس')}</label><select id="ipSource"><option value="manual">${t('手动输入', 'دستی')}</option><option value="random">${t('CF 随机 IP', 'IP تصادفی CF')}</option><option value="url">${t('从 URL 获取', 'از URL')}</option></select></div>
      <div class="field"><label for="probePort">${t('默认端口', 'پورت پیش‌فرض')}</label><input id="probePort" type="number" value="443" min="1" max="65535"></div></div>
      <div id="randomSource" hidden class="field-row"><div class="field"><label for="randomCount">${t('生成数量（1–300）', 'تعداد (۱ تا ۳۰۰)')}</label><input id="randomCount" type="number" value="20" min="1" max="300"></div><div class="field"><label>${t('生成候选地址', 'تولید آدرس')}</label><button id="generateIPs" type="button" class="btn">${t('生成 IP', 'تولید IP')}</button></div></div>
      <div id="urlSource" hidden class="field"><label for="probeSourceUrl">${t('来源 URL（多个用逗号分隔）', 'URL منابع (با کاما جدا کنید)')}</label><div class="link-row"><input id="probeSourceUrl" type="text" placeholder="https://example.com/ips.txt"><button id="fetchIPs" type="button" class="btn">${t('获取地址', 'دریافت آدرس‌ها')}</button></div></div>
      <div class="field"><label for="probeTargets">${t('待测 IP 或域名', 'IP یا دامنه')}</label><textarea id="probeTargets" class="mono" rows="3" placeholder="192.0.2.1:443#节点名"></textarea></div>
      <div class="row"><button id="startProbe" type="button" class="btn primary">${t('开始测试', 'شروع آزمایش')}</button><button id="stopProbe" type="button" class="btn" hidden>${t('停止', 'توقف')}</button><label class="small muted" for="probeThreads">${t('并发', 'همزمان')}</label><input id="probeThreads" type="number" value="4" min="1" max="16" style="width:75px"><span id="probeStatus" class="small muted" role="status" aria-live="polite">${t('等待测试', 'در انتظار آزمایش')}</span></div>
      <div class="progress" id="probeProgress" hidden><span></span></div><div class="empty-state" id="probeEmpty">${t('测试结果将在这里显示', 'نتایج اینجا نمایش داده می‌شود')}</div>
      <div id="probeResults" hidden><div class="row" style="margin-top:18px"><select id="probeFilter" class="test-filter" aria-label="${t('筛选结果', 'فیلتر نتایج')}"><option value="">${t('按机房筛选', 'فیلتر بر اساس مرکز داده')}</option><option value="fastest10">${t('只选择最快的 10 个', 'انتخاب ۱۰ مورد سریع‌تر')}</option></select><button class="text-button" id="selectResults" type="button">${t('全选可用项', 'انتخاب موارد قابل استفاده')}</button><button class="text-button" id="clearResults" type="button">${t('取消全选', 'لغو انتخاب')}</button></div>
      <fieldset id="probeCityFilter" class="probe-city-filter" hidden><legend>${t('机房（可多选）', 'مراکز داده (چند انتخاب)')}</legend><div id="probeCities" class="row"></div></fieldset>
      <div class="results-wrap"><table><thead><tr><th>${t('选择', 'انتخاب')}</th><th>${t('地址', 'آدرس')}</th><th>${t('延迟', 'تأخیر')}</th><th>${t('机房 / 状态', 'مرکز داده / وضعیت')}</th></tr></thead><tbody id="probeRows"></tbody></table></div>
      <div class="row" style="margin-top:15px"><button id="appendResults" type="button" class="btn">${t('追加至列表', 'افزودن به لیست')}</button><button id="replaceResults" type="button" class="btn">${t('替换列表', 'جایگزینی لیست')}</button><span class="hint">${t('加入后点击“保存更改”生效。', 'برای اعمال ذخیره کنید.')}</span></div></div>
    </section>
  </main>
  <footer class="savebar"><span id="saveState" class="save-state" role="status" aria-live="polite">${t('所有更改已保存', 'همه تغییرات ذخیره شد')}</span><div class="row"><button id="discardChanges" type="button" class="btn" hidden>${t('撤销更改', 'لغو تغییرات')}</button><button id="saveConfig" type="submit" form="configForm" class="btn primary" disabled>${t('保存更改', 'ذخیره تغییرات')}<kbd>Ctrl S</kbd></button></div></footer>
</div>`;
  return documentPage({ lang, fa, title: titles.subscription, body, client,
    boot: { fa, token, config, kvEnabled, keys: Object.keys(defaults), clients,
      titles, descriptions, ranges, datacenters } });
}
