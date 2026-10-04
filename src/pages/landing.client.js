(() => {
  'use strict';
  const boot = JSON.parse(document.getElementById('boot').textContent);
  const $ = id => document.getElementById(id);
  const t = (zh, fa) => boot.fa ? fa : zh;
  try { document.documentElement.dataset.theme = localStorage.getItem('cfnew-theme') === 'light' ? 'light' : 'dark'; } catch {}
  $('revealCredential').addEventListener('click', () => {
    const reveal = $('credential').type === 'password';
    $('credential').type = reveal ? 'text' : 'password';
    $('revealCredential').textContent = reveal ? t('隐藏', 'پنهان') : t('显示', 'نمایش');
    $('revealCredential').setAttribute('aria-pressed', String(reveal));
  });
  $('languageSelector').addEventListener('change', () => {
    document.cookie = 'preferredLanguage=' + $('languageSelector').value + ';path=/;max-age=31536000;SameSite=Lax'
      + (location.protocol === 'https:' ? ';Secure' : '');
    location.reload();
  });
  $('connectForm').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('credential').value.trim();
    $('connectError').hidden = true;
    const controller = new AbortController();
    let timer;
    try {
      let path;
      if (boot.customPathMode) {
        if (!input || /[?#\s]/.test(input) || input.includes('//')
          || input.split('/').some(part => part === '.' || part === '..')) throw new Error(t('请输入有效的管理路径。', 'مسیر مدیریت معتبر وارد کنید.'));
        path = '/' + input.replace(/^\/+|\/+$/g, '');
        if (path === '/') throw new Error(t('管理路径不能为空。', 'مسیر خالی است.'));
      } else {
        if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input)) {
          throw new Error(t('UUID 格式不正确。', 'قالب UUID نامعتبر است.'));
        }
        path = '/' + input.toLowerCase();
      }
      $('connectButton').disabled = true;
      timer = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(path + '/region', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error(t('访问凭据不正确，请检查 U / D 配置。', 'اطلاعات دسترسی نامعتبر است؛ U / D را بررسی کنید.'));
      }
      const data = await response.json();
      if (!data.region) throw new Error(t('未找到管理页面。', 'پنل یافت نشد.'));
      location.assign(path);
    } catch (error) {
      $('connectError').textContent = error.name === 'AbortError' ? t('请求超时，请稍后重试。', 'درخواست تمام شد؛ دوباره تلاش کنید.') : error.message;
      $('connectError').hidden = false;
    } finally { clearTimeout(timer); $('connectButton').disabled = false; }
  });
})();
