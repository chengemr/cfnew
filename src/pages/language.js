export function isPersian(request) {
  const saved = (request.headers.get('Cookie') || '').split(';')
    .map(value => value.trim()).find(value => value.startsWith('preferredLanguage='))?.split('=')[1];
  if (saved === 'fa' || saved === 'fa-IR') return true;
  if (saved === 'zh' || saved === 'zh-CN') return false;
  const accepted = request.headers.get('Accept-Language') || '';
  return accepted.split(',')[0].split('-')[0].toLowerCase() === 'fa'
    || accepted.includes('fa-IR') || accepted.includes('fa');
}
