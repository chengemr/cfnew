(() => {
  'use strict';
  const boot = JSON.parse(document.getElementById('boot').textContent);
  const $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  const t = (zh, fa) => boot.fa ? fa : zh;
  let saved = { ...boot.config };
  let baseline = {};
  let basePath = location.pathname.replace(/\/$/, '');
  let kvEnabled = boot.kvEnabled;
  let busy = false;
  let toastTimer;
  let regionRequest = 0;

  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.toggle('error', error);
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 8000 : 4200);
  }
  function readControls() {
    return Object.fromEntries(all('[data-config]').map(control => [control.dataset.config,
      control.type === 'checkbox' ? (control.checked ? 'yes' : 'no') : control.value]));
  }
  function changes() {
    return Object.fromEntries(Object.entries(readControls()).filter(([key, value]) => value !== baseline[key]));
  }
  function showPanel() {
    const requested = location.hash.slice(1);
    const panel = Object.hasOwn(boot.titles, requested) ? requested : 'subscription';
    for (const el of all('[data-panel], [data-extra-panel]')) {
      el.hidden = (el.dataset.panel || el.dataset.extraPanel) !== panel;
    }
    for (const nav of all('[data-nav]')) {
      nav.classList.toggle('active', nav.dataset.nav === panel);
      if (nav.dataset.nav === panel) nav.setAttribute('aria-current', 'page');
      else nav.removeAttribute('aria-current');
    }
    $('pageTitle').textContent = boot.titles[panel];
    $('breadcrumb').textContent = boot.titles[panel];
    $('pageDescription').textContent = boot.descriptions[panel];
    document.title = boot.titles[panel] + ' · CFnew';
  }
  function updateDirty() {
    const count = Object.keys(changes()).length;
    $('saveState').textContent = busy ? t('正在同步配置…', 'در حال همگام‌سازی…')
      : !kvEnabled ? t('未绑定 KV，配置只读', 'بدون KV، فقط خواندنی')
      : count ? t(count + ' 项更改尚未保存', count + ' تغییر ذخیره نشده')
      : t('所有更改已保存', 'همه تغییرات ذخیره شد');
    $('saveState').classList.toggle('dirty', count > 0);
    $('saveConfig').disabled = busy || !kvEnabled || !count;
    $('discardChanges').hidden = !count;
    $('discardChanges').disabled = busy;
    $('configBadge').textContent = count ? t('待保存', 'ذخیره نشده') : t('配置已读取', 'تنظیمات خوانده شد');
    $('configBadge').classList.toggle('warning', count > 0);
  }
  function syncControls() {
    $('configFields').disabled = busy || !kvEnabled;
    $('wk').disabled = Boolean($('p').value.trim());
    $('dkby').disabled = $('ech').checked;
    $('tp').disabled = !$('et').checked;
    if ($('ech').checked) $('dkby').value = 'yes';
    $('appendResults').disabled = $('replaceResults').disabled = !kvEnabled || busy;
    updateDirty();
  }
  function renderSaved() {
    const protocols = ['ev', 'et', 'ex'].filter(key => saved[key] === 'yes');
    $('protocolMetric').textContent = protocols.length + t(' 种', ' پروتکل');
    $('protocolCaption').textContent = protocols.map(key => ({ ev: 'VLESS', et: 'Trojan', ex: 'XHTTP' })[key]).join(' / ');
    $('routeMetric').textContent = saved.qj === 'only' ? t('仅代理', 'فقط پروکسی')
      : saved.s ? (saved.qj === 'no' ? t('优先直连', 'ابتدا مستقیم') : t('优先代理', 'اولویت پروکسی'))
      : t('直连 / 回退', 'مستقیم / جایگزین');
    $('routeCaption').textContent = saved.s ? t('已配置上游代理', 'پروکسی تنظیم شده') : t('未配置上游代理', 'بدون پروکسی');
    $('storageMetric').textContent = kvEnabled ? 'KV' : 'ENV';
    $('storageCaption').textContent = kvEnabled ? t('配置可保存', 'قابل ذخیره') : t('使用环境变量', 'متغیرهای محیطی');
    $('kvNotice').hidden = kvEnabled;
    $('proxyStatus').textContent = saved.p || t('使用项目回退逻辑', 'مسیر جایگزین پروژه');
    $('upstreamStatus').textContent = saved.s ? t('已配置（凭据隐藏）', 'تنظیم شده (اطلاعات پنهان)') : t('未配置', 'تنظیم نشده');
    $('echStatus').textContent = (saved.ech === 'yes' ? t('ECH 已启用', 'ECH فعال') : t('ECH 未启用', 'ECH غیرفعال'))
      + ' · ' + (saved.dkby === 'yes' ? t('仅 TLS', 'فقط TLS') : t('保留非 TLS 节点', 'نودهای غیر TLS مجاز'));
    $('client-10').hidden = saved.jk !== 'yes';
    if (saved.jk !== 'yes' && document.querySelector('input[name="client"]:checked')?.value === '10') {
      document.querySelector('input[name="client"][value="0"]').checked = true;
    }
    updateSubscription();
  }
  function hydrate(config) {
    saved = { ...config };
    for (const control of all('[data-config]')) {
      const value = config[control.dataset.config];
      if (control.type === 'checkbox') control.checked = value === 'yes';
      else {
        const text = value == null ? '' : String(value);
        if (control.tagName === 'SELECT' && ![...control.options].some(option => option.value === text)) {
          control.add(new Option(text, text));
        }
        control.value = text;
      }
    }
    if ($('ech').checked) $('dkby').value = 'yes';
    baseline = readControls();
    syncControls();
    renderSaved();
  }
  function normalizedBase(path) {
    let value = String(path || '').trim();
    if (!value) return '/' + boot.token;
    if (!value.startsWith('/')) value = '/' + value;
    return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
  }
  function updateBase(config) {
    const next = normalizedBase(config.d);
    if (next !== basePath) {
      basePath = next;
      history.replaceState(null, '', basePath + location.hash);
    }
  }
  function selectedClient() {
    return boot.clients[Number(document.querySelector('input[name="client"]:checked').value)];
  }
  function updateSubscription() {
    const [target, , , , , scheme] = selectedClient();
    const url = new URL(basePath + '/sub', location.origin);
    if (target) url.searchParams.set('target', target);
    $('subscriptionUrl').value = url.href;
    $('importSubscription').href = scheme ? scheme + encodeURIComponent(url.href) : '#';
    $('importSubscription').setAttribute('aria-disabled', String(!scheme));
    $('importSubscription').tabIndex = scheme ? 0 : -1;
  }
  async function requestJSON(suffix, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(basePath + suffix, {
        method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.message || data.error || 'HTTP ' + response.status);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(t('请求超时，请稍后刷新配置确认。', 'درخواست تمام شد؛ تنظیمات را دوباره بخوانید.'));
      throw error;
    } finally { clearTimeout(timer); }
  }
  function setBusy(value) {
    busy = value;
    $('refreshConfig').disabled = value;
    $('resetConfig').disabled = value;
    $('logout').disabled = value;
    syncControls();
  }
  function validate(diff) {
    const current = readControls();
    if (('qj' in diff || 's' in diff) && current.qj === 'only' && !current.s.trim()) {
      throw new Error(t('仅代理模式需要填写上游代理。', 'حالت فقط پروکسی نیازمند پروکسی بالادست است.'));
    }
    if ('d' in diff && diff.d && (/\s|[?#]/.test(diff.d) || normalizedBase(diff.d) === '/'
      || diff.d.includes('//') || diff.d.split('/').some(part => part === '.' || part === '..'))) {
      throw new Error(t('管理路径不能包含空格、?、#、连续斜杠或 . / .. 段。', 'مسیر مدیریت نامعتبر است.'));
    }
    if ('d' in diff && diff.d && new URL(normalizedBase(diff.d), location.origin).pathname !== normalizedBase(diff.d)) {
      throw new Error(t('管理路径请使用 URL 可直接使用的字符，例如 /my/panel。', 'مسیر باید از نویسه‌های مجاز URL استفاده کند؛ مانند /my/panel.'));
    }
    for (const key of ['homepage', 'yxURL', 'scu']) {
      if (!(key in diff) || !diff[key]) continue;
      const urls = key === 'yxURL' ? diff[key].split(',').map(url => url.trim()).filter(Boolean) : [diff[key]];
      if (!urls.length || urls.length > 16) throw new Error(t('最多 16 个优选来源。', 'حداکثر ۱۶ منبع.'));
      for (const value of urls) {
        let url;
        try { url = new URL(value); } catch { throw new Error(key + t(' 必须是完整 URL。', ' باید URL کامل باشد.')); }
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error(key + t(' 仅支持 HTTP(S)。', ' فقط HTTP(S).'));
      }
    }
    if ('yx' in diff) diff.yx = diff.yx.split(/[\r\n,]+/).map(line => line.trim()).filter(Boolean).join(',');
    return diff;
  }
  async function saveConfig(reset = false) {
    if (busy || !kvEnabled) return;
    try {
      const diff = reset ? Object.fromEntries(boot.keys.map(key => [key, ''])) : validate(changes());
      if (!Object.keys(diff).length) return;
      setBusy(true);
      const result = await requestJSON('/api/config', diff);
      if (!result.success || !result.config) throw new Error(t('保存未成功。', 'ذخیره ناموفق بود.'));
      updateBase(result.config);
      hydrate(result.config);
      toast(reset ? t('已恢复环境变量与默认配置。', 'تنظیمات محیطی و پیش‌فرض بازگردانده شد.')
        : t('配置已保存。', 'تنظیمات ذخیره شد.'));
      void refreshRegion();
    } catch (error) { toast(error.message, true); }
    finally { setBusy(false); }
  }
  async function refreshConfig() {
    if (busy) return;
    if (Object.keys(changes()).length && !confirm(t('刷新将丢弃未保存的更改，是否继续？', 'تغییرات ذخیره‌نشده حذف می‌شوند؛ ادامه؟'))) return;
    if (!kvEnabled) { location.reload(); return; }
    setBusy(true);
    try {
      const result = await requestJSON('/api/config');
      kvEnabled = Boolean(result.kvEnabled);
      updateBase(result);
      hydrate(result);
      toast(t('已读取最新配置。', 'تنظیمات خوانده شد.'));
      void refreshRegion();
    } catch (error) { toast(error.message, true); }
    finally { setBusy(false); }
  }
  async function refreshRegion() {
    const version = ++regionRequest;
    $('refreshStatus').disabled = true;
    try {
      const region = await requestJSON('/region');
      if (version !== regionRequest) return;
      $('regionMetric').textContent = region.region || '—';
      const source = region.ci ? t('自定义 ProxyIP', 'ProxyIP سفارشی')
        : region.manualRegion ? t('手动指定地区', 'منطقه دستی') : t('官方直连配置', 'تنظیم اتصال مستقیم');
      $('regionCaption').textContent = source;
      $('regionSource').textContent = source;
    } catch (error) {
      if (version !== regionRequest) return;
      $('regionMetric').textContent = '—';
      $('regionCaption').textContent = t('地区读取失败', 'خواندن منطقه ناموفق');
      $('regionSource').textContent = error.message;
    } finally { if (version === regionRequest) $('refreshStatus').disabled = false; }
  }
  async function copySubscription() {
    try {
      const value = $('subscriptionUrl').value;
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const input = document.createElement('textarea');
        input.value = value; input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.append(input);
        try { input.select(); if (!document.execCommand('copy')) throw new Error('clipboard'); }
        finally { input.remove(); }
      }
      toast(t('订阅链接已复制。', 'لینک اشتراک کپی شد.'));
    } catch { toast(t('复制失败，请显示链接后手动复制。', 'کپی ناموفق؛ لینک را نمایش داده و دستی کپی کنید.'), true); }
  }
  $('configForm').addEventListener('submit', event => { event.preventDefault(); void saveConfig(); });
  $('configForm').addEventListener('input', syncControls);
  $('configForm').addEventListener('change', event => {
    if (['ev', 'et', 'ex'].includes(event.target.id) && !['ev', 'et', 'ex'].some(id => $(id).checked)) {
      $(event.target.id).checked = true;
      toast(t('至少需要保留一种协议。', 'حداقل یک پروتکل لازم است.'), true);
    }
    syncControls();
  });
  $('discardChanges').addEventListener('click', () => hydrate(saved));
  $('refreshConfig').addEventListener('click', refreshConfig);
  $('refreshStatus').addEventListener('click', refreshRegion);
  $('logout').addEventListener('click', async () => {
    if (busy) return;
    if (Object.keys(changes()).length && !confirm(t('退出将丢弃未保存的更改，是否继续？', 'تغییرات ذخیره‌نشده حذف می‌شوند؛ خارج شوید؟'))) return;
    setBusy(true);
    try {
      await requestJSON('/api/logout', {});
      hydrate(saved);
      location.replace('/');
    } catch (error) { toast(error.message, true); }
    finally { setBusy(false); }
  });
  $('resetConfig').addEventListener('click', () => {
    if (confirm(t('移除页面管理的 KV 配置并恢复环境变量与默认设置？', 'تنظیمات KV حذف و محیط و پیش‌فرض‌ها بازگردانده شود؟'))) void saveConfig(true);
  });
  all('input[name="client"]').forEach(input => input.addEventListener('change', updateSubscription));
  all('[data-reveal]').forEach(button => button.addEventListener('click', () => {
    const input = $(button.dataset.reveal);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? t('隐藏', 'پنهان') : t('显示', 'نمایش');
    button.setAttribute('aria-pressed', String(show));
  }));
  $('copySubscription').addEventListener('click', copySubscription);
  $('importSubscription').addEventListener('click', event => {
    if ($('importSubscription').getAttribute('aria-disabled') === 'true') event.preventDefault();
    else toast(t('已请求打开客户端；若无响应，请复制链接手动导入。', 'درخواست باز کردن کلاینت ارسال شد؛ در صورت نیاز لینک را کپی کنید.'));
  });
  $('downloadSubscription').addEventListener('click', async () => {
    $('downloadSubscription').disabled = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch($('subscriptionUrl').value, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const [target] = selectedClient();
      link.href = url;
      link.download = 'cfnew-' + (target || 'base64') + ({ clash: '.yaml', vg: '.yaml', singbox: '.json', surge: '.conf', loon: '.conf', quanx: '.conf' }[target] || '.txt');
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast(t('下载失败：', 'دانلود ناموفق: ') + error.message, true); }
    finally { clearTimeout(timer); $('downloadSubscription').disabled = false; }
  });
  try { document.documentElement.dataset.theme = localStorage.getItem('cfnew-theme') === 'light' ? 'light' : 'dark'; } catch {}
  $('themeToggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('cfnew-theme', theme); } catch {}
  });
  $('languageSelector').addEventListener('change', () => {
    if (Object.keys(changes()).length && !confirm(t('切换语言将丢弃未保存更改，是否继续？', 'تغییرات ذخیره‌نشده حذف می‌شوند؛ ادامه؟'))) {
      $('languageSelector').value = boot.fa ? 'fa' : 'zh'; return;
    }
    document.cookie = 'preferredLanguage=' + $('languageSelector').value + ';path=/;max-age=31536000;SameSite=Lax'
      + (location.protocol === 'https:' ? ';Secure' : '');
    location.reload();
  });
  window.addEventListener('beforeunload', event => {
    if (Object.keys(changes()).length) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveConfig(); }
  });
  window.addEventListener('hashchange', () => { showPanel(); window.scrollTo(0, 0); });

  // The endpoint probe retains the existing nip.lfree.org mechanism. It is
  // deliberately separate from the Worker transport and cannot verify a tunnel.
  let probeController;
  let results = [];
  function validPort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('端口必须为 1–65535。', 'پورت باید ۱ تا ۶۵۵۳۵ باشد.'));
    return port;
  }
  function parseTarget(value, defaultPort) {
    const [address, ...nameParts] = value.trim().split('#');
    let host = address;
    let port = defaultPort;
    if (address.startsWith('[')) {
      const match = address.match(/^\[([^\]]+)\](?::(\d+))?$/);
      if (!match) throw new Error(t('IPv6 格式错误', 'قالب IPv6 نامعتبر'));
      host = match[1]; if (match[2]) port = validPort(match[2]);
    } else if (address.split(':').length === 2) {
      [host, port] = address.split(':'); port = validPort(port);
    }
    if (host.includes(':')) new URL('http://[' + host + ']/');
    else if (!/^[a-z\d.-]+$/i.test(host) || !host) throw new Error(t('地址格式错误', 'آدرس نامعتبر'));
    return { host, port, name: nameParts.join('#') || '' };
  }
  async function probe(target, signal) {
    if (target.host.includes(':')) return { ...target, success: false, error: t('此探测端点暂不支持 IPv6', 'نقطه آزمایش IPv6 را پشتیبانی نمی‌کند') };
    const octets = target.host.split('.');
    const ipv4 = octets.length === 4 && octets.every(part => /^\d+$/.test(part) && Number(part) <= 255);
    const endpoint = (ipv4 ? octets.map(part => Number(part).toString(16).padStart(2, '0')).join('') : target.host) + '.nip.lfree.org';
    const url = 'https://' + endpoint + ':' + target.port + '/';
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    const timer = setTimeout(abort, 8000);
    try {
      const first = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!first.ok) throw new Error('HTTP ' + first.status);
      const body = await first.text();
      let colo = '';
      try { colo = String(JSON.parse(body).colo || ''); } catch {}
      const start = performance.now();
      const second = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!second.ok) throw new Error('HTTP ' + second.status);
      await second.text();
      return { ...target, success: true, latency: Math.round(performance.now() - start), colo };
    } catch (error) {
      return { ...target, success: false, error: signal.aborted ? t('已停止', 'متوقف شد')
        : error.name === 'AbortError' ? t('超时', 'زمان تمام شد') : error.message };
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  function addResult(result) {
    const index = results.push(result) - 1;
    const row = document.createElement('tr');
    row.dataset.colo = result.colo || '';
    const choice = document.createElement('input'); choice.type = 'checkbox';
    choice.dataset.index = String(index); choice.disabled = !result.success; choice.checked = result.success;
    choice.setAttribute('aria-label', (result.host || result.name) + ':' + (result.port || ''));
    const cell = document.createElement('td'); cell.append(choice); row.append(cell);
    for (const [text, className] of [
      [(result.host || result.name) + (result.port ? ':' + result.port : ''), 'mono'],
      [result.success ? result.latency + ' ms' : '—', result.success ? 'success' : 'muted'],
      [result.success ? (boot.fa ? result.colo : boot.datacenters[result.colo]) || result.colo || t('请求成功', 'درخواست موفق') : result.error, result.success ? '' : 'error-text']
    ]) { const td = document.createElement('td'); td.textContent = text; td.className = className; row.append(td); }
    $('probeRows').append(row);
    if (result.success && result.colo && !all('[data-probe-city]').some(input => input.value === result.colo)) {
      const label = document.createElement('label');
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true;
      input.value = result.colo; input.dataset.probeCity = result.colo;
      label.append(input, document.createTextNode((boot.fa ? result.colo : boot.datacenters[result.colo]) || result.colo));
      $('probeCities').append(label); $('probeCityFilter').hidden = false;
    }
    filterResults();
  }
  function filterResults(select = false) {
    const fastest = $('probeFilter').value === 'fastest10';
    const indices = new Set(results.map((result, index) => ({ result, index }))
      .filter(({ result }) => result.success).sort((a, b) => a.result.latency - b.result.latency)
      .slice(0, 10).map(({ index }) => index));
    const cities = all('[data-probe-city]');
    const selected = new Set(cities.filter(input => input.checked).map(input => input.value));
    const everyCity = selected.size === cities.length;
    $('probeCityFilter').disabled = fastest;
    for (const row of [...$('probeRows').rows]) {
      const input = row.querySelector('input');
      row.hidden = fastest ? !indices.has(Number(input.dataset.index))
        : selected.size > 0 && !everyCity && !selected.has(row.dataset.colo);
      if (row.hidden || !fastest && !selected.size && cities.length) input.checked = false;
      else if (fastest || select) input.checked = !input.disabled;
    }
  }
  $('ipSource').addEventListener('change', () => {
    $('randomSource').hidden = $('ipSource').value !== 'random';
    $('urlSource').hidden = $('ipSource').value !== 'url';
  });
  $('generateIPs').addEventListener('click', () => {
    try {
      const count = Number($('randomCount').value); const port = validPort($('probePort').value);
      if (!Number.isInteger(count) || count < 1 || count > 300) throw new Error(t('生成数量为 1–300。', 'تعداد ۱ تا ۳۰۰.'));
      const candidates = new Set();
      while (candidates.size < count) {
        const [address, prefix] = boot.ranges[Math.floor(Math.random() * boot.ranges.length)].split('/');
        const integer = address.split('.').reduce((sum, octet) => (sum << 8) | Number(octet), 0) >>> 0;
        const hostBits = 32 - Number(prefix); const mask = (0xffffffff << hostBits) >>> 0;
        const ip = (((integer & mask) >>> 0) + Math.floor(Math.random() * 2 ** hostBits)) >>> 0;
        candidates.add([24, 16, 8, 0].map(shift => (ip >>> shift) & 255).join('.') + ':' + port);
      }
      $('probeTargets').value = [...candidates].join('\n');
      toast(t('候选地址已生成。', 'آدرس‌ها تولید شد.'));
    } catch (error) { toast(error.message, true); }
  });
  $('fetchIPs').addEventListener('click', async () => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
    $('fetchIPs').disabled = true;
    try {
      const sources = [...new Set($('probeSourceUrl').value.split(',').map(value => value.trim()).filter(Boolean))];
      if (!sources.length) throw new Error('HTTP(S) URL');
      const addresses = [];
      for (const source of sources) {
        const url = new URL(source);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP(S) URL');
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const text = await response.text();
        let entries;
        try {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error('array');
          entries = data.map(item => typeof item === 'string' ? item : (item.ip.includes(':') ? '[' + item.ip + ']' : item.ip)
            + ':' + (item.port || 443) + (item.name ? '#' + item.name : ''));
        } catch { entries = text.split(/[\r\n]+/).filter(line => !line.trim().startsWith('#')).flatMap(line => line.split(',')); }
        addresses.push(...entries);
      }
      $('probeTargets').value = [...new Set(addresses.map(value => value.trim()).filter(Boolean))].slice(0, 300).join('\n');
      toast(t('地址已读取（最多 300 条）。', 'آدرس‌ها خوانده شد (حداکثر ۳۰۰).'));
    } catch (error) { toast(t('读取失败（来源需允许跨域访问）：', 'خواندن ناموفق (نیازمند CORS): ') + error.message, true); }
    finally { clearTimeout(timer); $('fetchIPs').disabled = false; }
  });
  $('startProbe').addEventListener('click', async () => {
    if (probeController) return;
    try {
      const targets = $('probeTargets').value.split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean);
      const port = validPort($('probePort').value); const threads = Number($('probeThreads').value);
      if (!targets.length || targets.length > 300) throw new Error(t('请填写 1–300 个地址。', '۱ تا ۳۰۰ آدرس وارد کنید.'));
      if (!Number.isInteger(threads) || threads < 1 || threads > 16) throw new Error(t('并发数为 1–16。', 'همزمان ۱ تا ۱۶.'));
      probeController = new AbortController(); const signal = probeController.signal;
      results = []; $('probeRows').replaceChildren();
      $('probeFilter').value = ''; $('probeCities').replaceChildren(); $('probeCityFilter').hidden = true;
      $('startProbe').disabled = true; $('stopProbe').hidden = false; $('probeProgress').hidden = false;
      $('probeEmpty').hidden = true; $('probeResults').hidden = false;
      $('probeProgress').firstElementChild.style.width = '0';
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(threads, targets.length) }, async () => {
        while (!signal.aborted && cursor < targets.length) {
          const value = targets[cursor++]; let result;
          try { result = await probe(parseTarget(value, port), signal); }
          catch (error) { result = { name: value, success: false, error: error.message }; }
          addResult(result);
          $('probeStatus').textContent = results.length + ' / ' + targets.length;
          $('probeProgress').firstElementChild.style.width = results.length / targets.length * 100 + '%';
        }
      }));
      $('probeStatus').textContent = (signal.aborted ? t('已停止', 'متوقف شد') : t('测试完成', 'آزمایش کامل')) + ' · '
        + results.filter(result => result.success).length + ' / ' + results.length + t(' 请求成功', ' درخواست موفق');
    } catch (error) { toast(error.message, true); }
    finally { probeController = null; $('startProbe').disabled = false; $('stopProbe').hidden = true; }
  });
  $('stopProbe').addEventListener('click', () => probeController?.abort());
  $('probeFilter').addEventListener('change', () => {
    if (!$('probeFilter').value) all('[data-probe-city]').forEach(input => { input.checked = true; });
    filterResults(true);
  });
  $('probeCities').addEventListener('change', () => filterResults(true));
  $('selectResults').addEventListener('click', () => {
    for (const row of [...$('probeRows').rows]) if (!row.hidden && !row.querySelector('input').disabled) row.querySelector('input').checked = true;
  });
  $('clearResults').addEventListener('click', () => $('probeRows').querySelectorAll('input').forEach(input => { input.checked = false; }));
  function useResults(replace) {
    if (busy || !kvEnabled) return;
    const entries = [...$('probeRows').querySelectorAll('input:checked')].map(input => results[Number(input.dataset.index)])
      .filter(result => result.success).map(result => (result.host.includes(':') ? '[' + result.host + ']' : result.host)
        + ':' + result.port + '#' + (result.name || (boot.fa ? result.colo : boot.datacenters[result.colo]) || result.colo || result.host));
    if (!entries.length) { toast(t('请先选择可用结果。', 'ابتدا نتایج قابل استفاده را انتخاب کنید.'), true); return; }
    const previous = replace ? [] : $('yx').value.split(/[\r\n,]+/).map(value => value.trim()).filter(Boolean);
    $('yx').value = [...new Set([...previous, ...entries])].join(',');
    syncControls(); toast(t('已加入列表，保存更改后生效。', 'به لیست افزوده شد؛ تغییرات را ذخیره کنید.'));
  }
  $('appendResults').addEventListener('click', () => useResults(false));
  $('replaceResults').addEventListener('click', () => useResults(true));
  window.addEventListener('pagehide', () => { probeController?.abort(); clearTimeout(toastTimer); });
  hydrate(saved); showPanel(); void refreshRegion();
})();
