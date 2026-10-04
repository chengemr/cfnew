export function isUUID(字符串) {
  const 用户正则 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return 用户正则.test(字符串);
}

export function normalizePath(路径) {
  const 文本 = String(路径 || '').trim();
  if (!文本) return '';
  const 完整路径 = 文本.startsWith('/') ? 文本 : '/' + 文本;
  return 完整路径.length > 1 && 完整路径.endsWith('/') ? 完整路径.slice(0, -1) : 完整路径;
}

export function resolveManagementRoute(路径, 自定义路径值, 令牌) {
  const 请求路径 = normalizePath(路径);
  const 自定义基础路径 = normalizePath(自定义路径值);
  const 基础路径 = 自定义基础路径 || '/' + 令牌;
  const 后缀 = 请求路径 === 基础路径 ? '' : 请求路径.startsWith(基础路径 + '/') ? 请求路径.slice(基础路径.length) : null;
  const 路由 = {
    '': 'page', '/sub': 'subscription', '/api/config': 'config',
    '/api/preferred-ips': 'preferred', '/region': 'region', '/test-api': 'test'
  }[后缀];
  if (路由) return 路由;
  if (请求路径.endsWith('/api/config') || 请求路径.endsWith('/api/preferred-ips')) return 'invalid-api';
  const 首段 = 请求路径.split('/')[1];
  if (isUUID(首段) && (自定义基础路径 || 首段 !== 令牌)) return 'denied';
  return null;
}
