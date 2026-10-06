import { normalizeSwitch, resolveConfig } from './config.js';
import { isIPAddress, isDomain, normalizePort, parsePreferredList, serializePreferredList } from './preferred.js';
import { validateConfig, validatePreferredName } from './validation.js';

const badRequest = message => Response.json({ success: false, error: message, message }, { status: 400 });

export async function handleConfig(request, env, store, snapshot) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!store) {
    return Response.json(request.method === 'POST'
      ? { success: false, message: 'KV存储未配置，无法保存配置' }
      : { error: 'KV存储未配置', kvEnabled: false }, { status: 503 });
  }
  if (request.method === 'GET') {
    return Response.json({ ...resolveConfig(env, snapshot), kvEnabled: true });
  }
  try {
    let changes;
    try { changes = await request.json(); } catch { return badRequest('无效的 JSON'); }
    const invalid = validateConfig(changes);
    if (invalid) return badRequest(invalid);
    const saved = await store.update(config => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value === null || value === undefined) delete config[key];
        else config[key] = ['ae', 'rm', 'yxby'].includes(key) ? normalizeSwitch(value) : value;
      }
      return config;
    });
    return Response.json({ success: true, message: '配置已保存', config: resolveConfig(env, saved) });
  } catch (error) {
    return Response.json({ success: false, message: '保存配置失败: ' + error.message }, { status: 500 });
  }
}

export async function handlePreferred(request, env, store, snapshot) {
  if (!store) return Response.json({ success: false, error: 'KV存储未配置',
    message: '需要配置KV存储才能使用此功能' }, { status: 503 });
  const config = resolveConfig(env, snapshot);
  if (config.ae !== 'yes') return Response.json({ success: false, error: 'API功能未启用',
    message: '出于安全考虑，优选IP API功能默认关闭。请在配置管理页面开启"允许API管理"选项后使用。' }, { status: 403 });
  if (request.method === 'GET') {
    const data = parsePreferredList(config.yx);
    return Response.json({ success: true, count: data.length, data });
  }
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return Response.json({ success: false, error: '不支持的请求方法',
      message: '支持的方法: GET, POST, DELETE' }, { status: 405 });
  }
  try {
    let body;
    try { body = await request.json(); } catch { return badRequest('无效的 JSON'); }
    if (request.method === 'POST') {
      const items = Array.isArray(body) ? body : [body];
      if (!items.length) return Response.json({ success: false, error: '请求数据为空', message: '请提供IP数据' }, { status: 400 });
      const added = [], skipped = [], errors = [];
      // Validate the complete batch before any KV update; never partially save
      // malformed inputs or names containing the legacy list separators.
      for (const item of items) {
        if (!item || typeof item !== 'object' || typeof item.ip !== 'string' || (!isIPAddress(item.ip) && !isDomain(item.ip))) {
          errors.push({ ip: typeof item?.ip === 'string' ? item.ip : '未知', reason: '无效的IP或域名格式' });
        } else if (normalizePort(item.port, 443) === null) {
          errors.push({ ip: item.ip, reason: '端口必须是1到65535之间的整数' });
        } else if (!validatePreferredName(item.name)) {
          errors.push({ ip: item.ip, reason: '名称必须是256字符以内的字符串，不能包含逗号、#或换行' });
        }
      }
      if (errors.length) return Response.json({ success: false, added: 0, errors: errors.length,
        message: '请求包含无效节点，未保存', data: { errors } }, { status: 400 });
      await store.update(stored => {
        const list = parsePreferredList(resolveConfig(env, stored).yx);
        for (const item of items) {
          const port = normalizePort(item.port, 443);
          if (list.some(node => node.ip === item.ip && node.port === port)) {
            skipped.push({ ip: item.ip, port, reason: '已存在' });
            continue;
          }
          const node = { ip: item.ip, port, name: item.name || `API优选-${item.ip}:${port}`,
            addedAt: new Date().toISOString() };
          list.push(node);
          added.push(node);
        }
        if (added.length) return { ...stored, yx: serializePreferredList(list) };
      });
      return Response.json({ success: added.length > 0, message: `成功添加 ${added.length} 个IP`,
        added: added.length, skipped: skipped.length, errors: errors.length,
        data: { addedIPs: added, skippedIPs: skipped.length ? skipped : undefined,
          errors: errors.length ? errors : undefined } });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('请求必须是 JSON 对象');
    if (body.all !== true && (typeof body.ip !== 'string' || (!isIPAddress(body.ip) && !isDomain(body.ip)))) return badRequest('无效的IP或域名格式');
    if (body.all !== true && !body.ip) return Response.json({ success: false, error: 'IP地址是必需的',
      message: '请提供要删除的ip字段，或使用 {"all": true} 清空所有' }, { status: 400 });
    let deleted = 0;
    const port = normalizePort(body.port, 443);
    if (body.all !== true && port === null) return Response.json({ success: false,
      error: '无效的端口', message: '端口必须是1到65535之间的整数' }, { status: 400 });
    await store.update(stored => {
      const list = parsePreferredList(resolveConfig(env, stored).yx);
      const remaining = body.all === true ? [] : list.filter(node => !(node.ip === body.ip && node.port === port));
      deleted = list.length - remaining.length;
      if (body.all === true || deleted) return { ...stored, yx: serializePreferredList(remaining) };
    });
    if (body.all === true) return Response.json({ success: true,
      message: `已清空所有优选IP，共删除 ${deleted} 个`, deletedCount: deleted });
    if (!deleted) return Response.json({ success: false, error: '优选IP不存在',
      message: `${body.ip}:${port} 未找到` }, { status: 404 });
    return Response.json({ success: true, message: '优选IP已删除', deleted: { ip: body.ip, port } });
  } catch (error) {
    return Response.json({ success: false, error: '处理请求失败', message: error.message }, { status: 500 });
  }
}
