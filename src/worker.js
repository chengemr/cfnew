// CFnew - 终端 v4.0.3
// 版本: v4.0.3
import { decodeBase64Text as 解码64 } from './encoding.js';

import { handleWebSocket, handleXHTTP } from './transports/sessions.js';
import { getConfigStore } from './storage.js';
import { createSettings, getAuthenticationToken } from './runtime.js';
import { fetchBytes } from './http.js';
import { handleConfig, handlePreferred } from './api.js';
import { parseAddress as 解析地址值端口, normalizePort } from './preferred.js';
import { getPaddingKeys as 获取叉HTTP填充标识, validatePadding as 校验叉HTTP填充, generatePadding as 生成叉HTTP填充串 } from './transports/padding.js';
import { generateSingBox } from './subscriptions/singbox.js';
import { generateSurge, generateLoon, generateQuantumultX } from './subscriptions/ini.js';
import { generateResidential } from './subscriptions/residential.js';
import { createNodeNamer, generateNodeLinks } from './subscriptions/nodes.js';
import { normalizePath as 规范化管理路径, resolveManagementRoute as 解析管理路由 } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderDashboard } from './pages/dashboard.js';
import { generateClash } from './subscriptions/clash.js';

const 直连域名列表 = [
  "cloudflare.182682.xyz",
  "speed.marisalnc.com",
  "freeyx.cloudflare88.eu.org",
  "bestcf.top",
  "cdn.2020111.xyz",
  "cfip.cfcdn.vip",
  "cf.0sm.com",
  "cf.090227.xyz",
  "cf.zhetengsha.eu.org",
  "cloudflare.9jy.cc",
  "cf.zerone-cdn.pp.ua",
  "cfip.1323123.xyz",
  "cnamefuckxxs.yuchen.icu",
  "cloudflare-ip.mofashi.ltd",
  "115155.xyz",
  "cname.xirancdn.us",
  "f3058171cad.002404.xyz",
  "8.889288.xyz",
  "cdn.tzpro.xyz",
  "cf.877771.xyz",
  "xn--b6gac.eu.org",
];

function 规范化节点主机(主机786) {
  const host = String(主机786 || '').trim().replace(/^\[([^\]]+)\]$/, '$1');
  if (!host || /[\s/@?#\\]/.test(host)) return '';
  try {
    // Use the clients' URL hostname rules, retaining IDN and existing aliases.
    new URL(`http://${host.includes(':') ? `[${host}]` : host}/`);
    return host;
  } catch { return ''; }
}

export default {
  async fetch(request, env, context) {
    try {
      const 认证令牌 = getAuthenticationToken(env);
      if (!认证令牌) return Response.json({ error: 'Configure U with a valid UUID before using this Worker.' }, { status: 503 });
      const 是否网页套接字 = request.headers.get('Upgrade') === "websocket";
      const isPost = request.method === 'POST';
      const url = new URL(request.url);
      if (!(env.C || env.c) && !是否网页套接字 && !isPost && url.pathname !== '/') {
        const authToken = 认证令牌;
        const customPath = (env.d || env.D || '').toLowerCase();
        const 首次值 = url.pathname.split('/').filter(Boolean)[0] || '';
        const 清理值 = 规范化管理路径(customPath);
        const 请求路径 = url.pathname.toLowerCase();
        const 自定义路径匹配 = 请求路径 === 清理值 || 请求路径.startsWith(清理值 + '/');
        if (首次值 !== authToken && 清理值 && !自定义路径匹配) {
          return new Response('Not Found', {
            status: 404
          });
        }
      }
      const store = getConfigStore(env.C || env.c);
      const stored = store ? await store.load() : {};
      const settings = createSettings(env, stored);
      const 管理路由 = 解析管理路由(url.pathname, settings.自定义路径, settings.认证令牌);
      if (管理路由 === 'config') return await handleConfig(request, env, store, stored);
      if (管理路由 === 'preferred') return await handlePreferred(request, env, store, stored);
      if (管理路由 === 'invalid-api' && !是否网页套接字) return Response.json({ error: 'Not Found' }, { status: 404 });
      if (request.method === 'POST' && settings.启用扩展传输) {
        const { 头: 叉填充头, 键: 叉填充键 } = 获取叉HTTP填充标识(settings.认证令牌);
        if (!校验叉HTTP填充(request, 叉填充头, 叉填充键)) {
          return new Response('Bad Request', {
            status: 400
          });
        }
        const relay = await handleXHTTP(request, settings);
        if (relay instanceof Response) return relay;
        if (relay) {
          context.waitUntil(relay.closed);
          const responseHeaders = {
            'X-Accel-Buffering': 'no',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'User-Agent': 'Go-http-client/2.0',
            'Content-Type': 'application/grpc'
          };
          try {
            const 响应填充 = new URL('https://x.invalid/');
            响应填充.searchParams.set(叉填充键, 生成叉HTTP填充串(100 + Math.floor(Math.random() * 901)));
            responseHeaders[叉填充头] = 响应填充.toString();
          } catch {}
          return new Response(relay.readable, {
            headers: responseHeaders
          });
        }
        return new Response('Internal Server Error', {
          status: 500
        });
      }
      if (request.headers.get('Upgrade') === "websocket") {
        return await handleWebSocket(request, settings);
      }
      if (request.method === 'GET') {
        if (管理路由 === 'region') {
          const 地区信息 = settings.手动工作器地区
            ? { region: settings.手动工作器地区, detectionMethod: '手动指定地区', manualRegion: settings.手动工作器地区 }
            : settings.回退地址 ? { region: 'CUSTOM', detectionMethod: 解码64('6Ieq5a6a5LmJUHJveHlJUOaooeW8jw=='), ci: settings.回退地址 }
            : { region: 'CF', detectionMethod: 解码64('5a6Y5pa555u06L+e') };
          return Response.json({ ...地区信息, timestamp: new Date().toISOString() });
        }
        if (管理路由 === 'test') {
          return Response.json({ detectedRegion: 'CF', message: 'API测试完成', timestamp: new Date().toISOString() });
        }
        if (url.pathname === '/') {
          // 检查是否有自定义首页URL配置
          const 自定义值 = settings.config.homepage;
          if (typeof 自定义值 === 'string' && 自定义值.trim()) {
            try {
              // 从自定义URL获取内容
              const { response: 值响应, bytes: 首页字节 } = await fetchBytes(自定义值.trim(), {
                method: 'GET',
                headers: {
                  'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
                  'Accept': request.headers.get('Accept') || '*/*',
                  'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9'
                },
                redirect: 'follow'
              }, { timeout: 5_000, maxBytes: 2 * 1024 * 1024 });
              if (值响应.ok) {
                // 获取响应内容
                const contentType = 值响应.headers.get('Content-Type') || 'text/html; charset=utf-8';
                const content = new TextDecoder().decode(首页字节);

                // 返回自定义首页内容
                return new Response(content, {
                  status: 值响应.status,
                  headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                  }
                });
              }
            } catch (error) {
              // 如果获取失败，继续使用默认终端页面
              console.error('获取自定义首页失败:', error);
            }
          }
          // 优先检查Cookie中的语言设置
          return renderLanding(request, settings.自定义路径);
        }
        if (管理路由 === 'page') return renderDashboard(request, settings.认证令牌, {
          config: settings.config, kvEnabled: Boolean(store)
        });
        if (管理路由 === 'subscription') return await 处理订阅请求(settings, request, settings.认证令牌, url);
        if (管理路由 === 'denied') {
          return Response.json({ error: '访问被拒绝', message: settings.自定义路径 ? '当前 Worker 已启用自定义路径模式，UUID 访问已禁用' : 'UUID错误' }, { status: 403 });
        }
      }
      return new Response(JSON.stringify({
        error: 'Not Found'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      return new Response(error.toString(), {
        status: 500
      });
    }
  }
};

async function 处理订阅请求(settings, request, token, url = null) {
  if (!url) url = new URL(request.url);
  const 最终链接列表 = [];
  const workerHost = url.hostname;
  const target = (url.searchParams.get('target') || 'base64').toLowerCase();
  const 家宽目标 = ['vg', 'jk', "jiakuan"].includes(target);
  if (家宽目标 && !settings.启用家宽链式) {
    return new Response('家宽链式没开。去配置管理勾上「开启家宽链式」，或者加环境变量 jk=yes。', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  const 转换目标 = ['clash', 'clashr', 'stash', 'meta', 'clashmeta',
    'vg', 'jk', 'jiakuan', 'surge', 'surge2', 'surge3', 'surge4',
    'quantumult', 'quanx', 'loon', 'singbox', 'sing-box'].includes(target);
  const 不兼容扩展传输 = 转换目标 && settings.启用扩展传输 && !settings.启用明文;
  if (不兼容扩展传输 && !settings.启用木马) {
    return new Response('当前订阅格式不支持原生 XHTTP，且未启用兼容的 WebSocket 协议。' +
      '请使用 V2Ray/base64 原生订阅，或启用 VLESS WebSocket（ev=yes）/Trojan WebSocket（et=yes）。', {
      status: 422,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  // These clients convert XHTTP to VLESS/WS. Only advertise that fallback when
  // the existing VLESS/WS receiver is enabled; keep native share links unchanged.
  const 节点设置 = 不兼容扩展传输 ? { ...settings, 启用扩展传输: false } : settings;
  const nodeNamer = createNodeNamer();

  const 客户端配置 = { dns: settings.自定义域名系统, echDomain: settings.自定义加密客户端问候域名 };
  function 添加节点(列表, 显式端口 = false) {
    const valid = 列表.filter(node => 规范化节点主机(node.ip) &&
      (node.port == null && !显式端口 || normalizePort(node.port) !== null));
    最终链接列表.push(...generateNodeLinks(节点设置, valid, token, workerHost, nodeNamer, 显式端口));
  }
  if (settings.启用原生地址) {
    添加节点([{ ip: workerHost, isp: '原生地址' }]);
  }
  const 是否有自定义优选 = settings.自定义优选地址列表.length > 0 || settings.自定义优选域名列表.length > 0;
  if (!settings.禁用优选) {
    if (是否有自定义优选) {
      if (settings.自定义优选地址列表.length > 0 && settings.启用优选地址) {
        添加节点(settings.自定义优选地址列表);
      }
      if (settings.自定义优选域名列表.length > 0 && settings.启用优选域名) {
        const 自定义域名列表 = settings.自定义优选域名列表.map(node => ({
          ip: node.domain,
          port: node.port,
          isp: node.name || node.domain
        }));
        添加节点(自定义域名列表);
      }
    } else {
      if (settings.启用优选域名) {
        const 域名列表 = 直连域名列表.map(ip => ({ ip, isp: ip }));
        添加节点(域名列表);
      }
      if (settings.启用优选地址) {
        if (!settings.优选地址源) {
          添加节点(await 获取值地址列表(settings));
        }
      }
      if (settings.启用仓库优选) {
        添加节点(await 获取值解析新地址列表(settings), true);
      }
    }
  }
  if (最终链接列表.length === 0) {
    return new Response('已启用的节点来源未提供有效节点，请检查来源开关、优选列表和源服务后重试。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  let 订阅内容;
  let contentType = 'text/plain; charset=utf-8';
  switch (target) {
    case "clash":
    case "clashr":
    case "stash":
    case 'meta':
    case "clashmeta":
      订阅内容 = generateClash(最终链接列表, 客户端配置);
      contentType = 'text/yaml; charset=utf-8';
      break;
    case 'vg':
    case 'jk':
    case "jiakuan":
      try {
        订阅内容 = await generateResidential(最终链接列表, 客户端配置);
      } catch (错误) {
        return new Response('家宽节点暂时拉不到：' + (错误 && 错误.message ? 错误.message : 错误) + '\n过几分钟再更新，客户端会先用着上一份。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
      contentType = 'text/yaml; charset=utf-8';
      break;
    case "surge":
    case "surge2":
    case "surge3":
    case "surge4":
      订阅内容 = generateSurge(最终链接列表, 客户端配置);
      break;
    case "quantumult":
    case "quanx":
      订阅内容 = generateQuantumultX(最终链接列表, 客户端配置);
      break;
    case "loon":
      订阅内容 = generateLoon(最终链接列表, 客户端配置);
      break;
    case "singbox":
    case "sing-box":
      订阅内容 = generateSingBox(最终链接列表, 客户端配置);
      contentType = 'application/json; charset=utf-8';
      break;
    default:
      订阅内容 = btoa(最终链接列表.join('\n'));
  }
  const 响应头部列表 = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
  };

  // 添加ECH状态到响应头
  if (settings.启用加密客户端问候) {
    响应头部列表['X-ECH-Status'] = 'ENABLED';
    响应头部列表['X-ECH-Config-Length'] = String(`${客户端配置.echDomain}+${客户端配置.dns}`.length);
  }
  return new Response(订阅内容, {
    headers: 响应头部列表
  });
}

async function 计算值摘要(text) {
  const digest = await crypto.subtle.digest('MD5', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function 获取值地址列表(settings) {
  const 分组线路映射 = {
    ctcc: '电信',
    cucc: '联通',
    cmcc: '移动',
    bgp: '多线',
    ipv6: 'IPv6'
  };
  const ipv4Enabled = settings.config.ipv4 !== 'no';
  const ipv6Enabled = settings.config.ipv6 !== 'no';
  const mobileEnabled = settings.config.ispMobile !== 'no';
  const unicomEnabled = settings.config.ispUnicom !== 'no';
  const telecomEnabled = settings.config.ispTelecom !== 'no';
  try {
    const timestamp = String(Date.now());
    const seedDigest = await 计算值摘要(解码64('RGRsVHh0TjBzVU91'));
    const requestKey = await 计算值摘要(seedDigest + 解码64('NzBjbG91ZGZsYXJlYXBpa2V5') + timestamp);
    const { response: response, bytes: 优选字节 } = await fetchBytes(`${解码64('aHR0cHM6Ly9hcGkudW91aW4uY29tL2luZGV4LnBocC9pbmRleC9DbG91ZGZsYXJl')}?key=${requestKey}&time=${timestamp}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!response.ok) return [];
    const data = JSON.parse(new TextDecoder().decode(优选字节));
    const groups = data && data.data;
    if (!groups) return [];
    const nodes = [];
    for (const groupName of Object.keys(分组线路映射)) {
      const isIPv6 = groupName === 'ipv6';
      if (isIPv6 && !ipv6Enabled) continue;
      if (!isIPv6 && !ipv4Enabled) continue;
      const isp = 分组线路映射[groupName];
      if (isp === '移动' && !mobileEnabled) continue;
      if (isp === '联通' && !unicomEnabled) continue;
      if (isp === '电信' && !telecomEnabled) continue;
      const group = groups[groupName];
      const items = group && Array.isArray(group.info) ? group.info : [];
      for (const item of items) {
        const address = 规范化节点主机(item && item.ip);
        if (!address) continue;
        nodes.push({
          isp: isp,
          ip: address,
          colo: ''
        });
      }
    }
    return nodes;
  } catch {}
  return [];
}

async function 获取值解析新地址列表(settings) {
  const urls = String(settings.优选地址源 || '').split(',').map(url => url.trim()).filter(Boolean);
  const lines = await 获取优选接口(urls, '443', 5000);
  const pattern = /^(\[[\da-fA-F:]+\]|[\d.]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*)(?::(\d+))?(?:#(.+))?$/;
  return lines.flatMap(line => {
    const match = line.match(pattern);
    return match ? [{ ip: 规范化节点主机(match[1]), port: Number(match[2] || 443),
      name: match[3]?.trim() || match[1] }] : [];
  });
}

async function 获取优选接口(网址列表, 默认端口 = '443', 超时 = 3000) {
  if (!网址列表?.length) return [];
  const 结果列表 = new Set();
  await Promise.allSettled(网址列表.map(async 网址 => {
    try {
      const { response: 响应, bytes: 缓冲 } = await fetchBytes(网址, {}, { timeout: 超时 });
      if (!响应.ok) return;
      let 文本 = '';
      try {
        const 内容类型 = (响应.headers.get('content-type') || '').toLowerCase();
        const 字符集 = 内容类型.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase() || '';
        let 解码器列表 = ['utf-8', 'gb2312'];
        if (字符集.includes('gb') || 字符集.includes('gbk') || 字符集.includes('gb2312')) {
          解码器列表 = ['gb2312', 'utf-8'];
        }
        let 解码成功 = false;
        for (const 解码器 of 解码器列表) {
          try {
            const 已解码 = new TextDecoder(解码器).decode(缓冲);
            if (已解码 && 已解码.length > 0 && !已解码.includes('\ufffd')) {
              文本 = 已解码;
              解码成功 = true;
              break;
            } else if (已解码 && 已解码.length > 0) {
              continue;
            }
          } catch {
            continue;
          }
        }
        if (!解码成功) {
          文本 = new TextDecoder().decode(缓冲);
        }
        if (!文本 || 文本.trim().length === 0) {
          return;
        }
      } catch {
        return;
      }
      const 行列表 = 文本.trim().split('\n').map(line => line.trim()).filter(行值 => 行值);
      const 是否值 = 行列表.length > 1 && 行列表[0].includes(',');
      const 六版地址模式 = /^[^\[\]]*:[^\[\]]*:[^\[\]]/;
      if (!是否值) {
        行列表.forEach(line => {
          const 井号索引 = line.indexOf('#');
          const [主机部分, 备注] = 井号索引 > -1 ? [line.substring(0, 井号索引), line.substring(井号索引)] : [line, ''];
          const { address, port } = 解析地址值端口(主机部分);
          const host = address.includes(':') ? `[${address}]` : address;
          const defaultPort = new URL(网址).searchParams.get('port') || 默认端口;
          结果列表.add(`${host}:${port || defaultPort}${备注}`);
        });
      } else {
        const 头部列表 = 行列表[0].split(',').map(column => column.trim());
        const 数据行列表 = 行列表.slice(1);
        if (头部列表.includes('IP地址') && 头部列表.includes('端口') && 头部列表.includes('数据中心')) {
          const ipIndex = 头部列表.indexOf('IP地址'),
            端口索引 = 头部列表.indexOf('端口');
          const 备注索引 = 头部列表.indexOf('国家') > -1 ? 头部列表.indexOf('国家') : 头部列表.indexOf('城市') > -1 ? 头部列表.indexOf('城市') : 头部列表.indexOf('数据中心');
          const 传输层安全索引 = 头部列表.indexOf('TLS');
          数据行列表.forEach(line => {
            const columns = line.split(',').map(column => column.trim());
            if (传输层安全索引 !== -1 && columns[传输层安全索引]?.toLowerCase() !== 'true') return;
            const host = 六版地址模式.test(columns[ipIndex]) ? `[${columns[ipIndex]}]` : columns[ipIndex];
            结果列表.add(`${host}:${columns[端口索引]}#${columns[备注索引]}`);
          });
        } else if (头部列表.some(column => column.includes('IP')) && 头部列表.some(column => column.includes('延迟')) && 头部列表.some(column => column.includes('下载速度'))) {
          const 地址索引 = 头部列表.findIndex(column => column.includes('IP'));
          const 延迟索引 = 头部列表.findIndex(column => column.includes('延迟'));
          const 速度索引 = 头部列表.findIndex(头值 => 头值.includes('下载速度'));
          const 端口 = new URL(网址).searchParams.get('port') || 默认端口;
          数据行列表.forEach(行 => {
            const 列列表 = 行.split(',').map(丙值 => 丙值.trim());
            const 包裹地址 = 六版地址模式.test(列列表[地址索引]) ? `[${列列表[地址索引]}]` : 列列表[地址索引];
            结果列表.add(`${包裹地址}:${端口}#CF优选 ${列列表[延迟索引]}ms ${列列表[速度索引]}MB/s`);
          });
        }
      }
    } catch {}
  }));
  return Array.from(结果列表);
}
