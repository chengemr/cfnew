// CFnew - 终端 v4.0.1
// 版本: v4.0.1
import { connect as 连接 } from 'cloudflare:sockets';
import { decodeBase64Text as 解码64 } from './encoding.js';

import { getConfigStore } from './storage.js';
import { createSettings, getAuthenticationToken } from './runtime.js';
import { fetchBytes } from './http.js';
import { handleConfig, handlePreferred } from './api.js';
import { parseAddress as 解析地址值端口 } from './preferred.js';
import { parseProxy as 解析代理配置 } from './transports/proxy.js';
import { createXHTTPRelay } from './transports/streams.js';
import { withConnectionDeadline, outboundAttempts } from './transports/connect.js';
import { getPaddingKeys as 获取叉HTTP填充标识, validatePadding as 校验叉HTTP填充, generatePadding as 生成叉HTTP填充串 } from './transports/padding.js';
import { generateSingBox } from './subscriptions/singbox.js';
import { generateSurge, generateLoon, generateQuantumultX } from './subscriptions/ini.js';
import { generateResidential } from './subscriptions/residential.js';
import { createNodeNamer, generateNodeLinks } from './subscriptions/nodes.js';
import { normalizePath as 规范化管理路径, resolveManagementRoute as 解析管理路由 } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderDashboard } from './pages/dashboard.js';
import { generateClash } from './subscriptions/clash.js';

// 官方直连地址池：内置实测可用地址，不依赖任何第三方域名
// CF 是任播，同一地址在不同位置落到的机房不同，所以不按地区区分
const 官方直连地址 = 解码64('MTcyLjcxLjIxOC4xOTAsMTYyLjE1OC4yMjguODcsMTYyLjE1OC4xODkuMTM0LDE2Mi4xNTguMjYuNjMsMTYyLjE1OC4yNS44NiwxNjIuMTU4LjI5LjIxNiwxNjIuMTU4LjIxOC4xNjAsMTYyLjE1OC4yMjcuMjE0LDE3Mi42OS4xMTguMTk4LDE3Mi42OS4xMTkuMTUw').split(',');
function 取官方直连地址() {
  const 命中 = 官方直连地址[Math.floor(Math.random() * 官方直连地址.length)];
  return {
    domain: 命中,
    port: 443
  };
}
const 地区回退域名 = new Map([
  ["HK", "ProxyIP.HK.CMLiussss.net"],
  ["US", "ProxyIP.US.CMLiussss.net"],
  ["SG", "ProxyIP.SG.CMLiussss.net"],
  ["JP", "ProxyIP.JP.CMLiussss.net"],
  ["KR", "ProxyIP.KR.CMLiussss.net"],
  ["DE", "ProxyIP.DE.CMLiussss.net"],
  ["SE", "ProxyIP.SE.CMLiussss.net"],
  ["NL", "ProxyIP.NL.CMLiussss.net"],
  ["FI", "ProxyIP.FI.CMLiussss.net"],
  ["GB", "ProxyIP.GB.CMLiussss.net"],
]);
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
const 错误_仅支持域名系统用户数据报 = "UDP proxy only enable for DNS which is port 53";
const 错误_网页套接字未打开 = "webSocket.eadyState is not open";
const 错误_代理无可用方法 = "no acceptable methods";
const 错误_代理需要认证 = "socks server needs auth";
const 错误_代理认证失败 = "fail to auth socks server";
const 错误_代理连接失败 = "fail to open socks connection";
const 错误_代理隧道失败 = "fail to open proxy tunnel";
const 错误_代理响应异常 = "invalid proxy response";
const 文本_连接方法 = "CONNECT";
const 文本_协议版本 = " HTTP/1.1";
const 文本_主机头 = "Host: ";
const 文本_代理认证头 = "Proxy-Authorization: Basic ";
const 文本_代理保持 = "Proxy-Connection: Keep-Alive";
const 文本_用户代理头 = "User-Agent: Mozilla/5.0";
const 文本_换行 = "\r\n";
const 文本_响应前缀 = "HTTP/";
const 代理种类_隧道 = 'pt';
const 代理种类_安全隧道 = 'pts';

const 地址类型_四版 = 1;
const 地址类型_网址 = 2;
const 地址类型_六版 = 3;
const 传输块大小 = 64 * 1024;
const 传输下载包大小 = 32 * 1024;
const 传输下载尾部 = 512;
const 传输下载延迟 = 0;
const 传输上传包大小 = 16 * 1024;
const 传输上传队列上限 = 256 * 1024;
const 传输连接竞速数 = 2;
const 首字节超时 = 3500;
const 共享解码器 = new TextDecoder();
const 唯一标识字节缓存 = new Map();

function 规范化节点主机(主机786) {
  return String(主机786 || '').trim().replace(/^\[([^\]]+)\]$/, '$1');
}

// 所有调用方都传入已大写的地区。固定地址池没有可用性探测，未知地区沿用 US。
async function 获取值备用地址(地区 = '', 地区匹配 = true) {
  if (!地区 || 地区 === 'CF') return 取官方直连地址();
  return { domain: 地区回退域名.get(地区匹配 ? 地区 : 'HK') || 地区回退域名.get('US'), port: 443 };
}

async function 获取回退目标(回退地址, 地区, 地区匹配, 端口) {
  if (回退地址 && 回退地址.trim()) {
    const 已解析 = 解析地址值端口(回退地址);
    return { address: 已解析.address, port: 已解析.port || 端口 };
  }
  const 备用 = await 获取值备用地址(地区, 地区匹配);
  return { address: 备用.domain, port: 备用.port };
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
    最终链接列表.push(...generateNodeLinks(节点设置, 列表, token, workerHost, nodeNamer, 显式端口));
  }
  async function 添加备用节点() {
    const 备用 = await 获取值备用地址(settings.当前工作器地区, settings.启用地区匹配);
    添加节点([{ ip: 备用.domain, isp: 'ProxyIP-' + settings.当前工作器地区 }]);
  }
  if (settings.启用原生地址) {
    try {
      添加节点([{ ip: workerHost, isp: '原生地址' }]);
    } catch (错误) {
      if (settings.当前工作器地区 === 'CUSTOM') throw 错误;
      await 添加备用节点();
    }
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
          try {
            const addresses = await 获取值地址列表(settings);
            if (addresses.length > 0) {
              添加节点(addresses);
            }
          } catch {
            await 添加备用节点();
          }
        }
      }
      if (settings.启用仓库优选) {
        try {
          const 新地址列表 = await 获取值解析新地址列表(settings);
          if (新地址列表.length > 0) {
            添加节点(新地址列表, true);
          }
        } catch {
          await 添加备用节点();
        }
      }
    }
  }
  if (最终链接列表.length === 0) {
    const 错误备注 = "所有节点获取失败";
    const protocol = "vless";
    const 错误链接 = `${protocol}://00000000-0000-0000-0000-000000000000@127.0.0.1:80?encryption=none&security=none&type=ws&host=error.com&path=%2F#${encodeURIComponent(错误备注)}`;
    最终链接列表.push(错误链接);
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

async function handleWebSocket(request, 配置快照) {
  const { 认证令牌, 启用明文, 启用木马, 传输路径 } = 配置快照;
  // 从 path query 读取覆盖参数
  const 请求网址 = new URL(request.url);
  const queryFallback = 请求网址.searchParams.get('p') || '';
  const queryRegion = (请求网址.searchParams.get('wk') || '').toUpperCase();
  const 请求值字符串 = 请求网址.searchParams.get('rm') || '';
  const queryRegionMatch = 请求值字符串 ? 请求值字符串.toLowerCase() !== 'no' : null;
  const 请求代理字符串 = 请求网址.searchParams.get('s') || '';
  let queryProxy = null;
  if (请求代理字符串) {
    try {
      queryProxy = 解析代理配置(请求代理字符串);
    } catch {}
  }

  const 网页套接字值 = new WebSocketPair();
  const [客户端值, websocket] = Object.values(网页套接字值);
  websocket.accept();
  websocket.binaryType = 'arraybuffer';
  let remote = {
    socket: null,
    writer: null,
    drainUpload: null
  };
  let 是否域名系统值 = false;
  let 协议类型 = null;
  let drainingUpload = false;
  let 传输值 = false;
  const 值队列 = createUploadQueue(传输上传包大小, 传输上传队列上限, 传输上传队列上限 >> 8);
  const fetcher = request.fetcher;
  const 连接取消 = new AbortController();
  const 出站配置 = { ...配置快照,
    已解析代理5配置: queryProxy || 配置快照.已解析代理5配置,
    是否代理已启用: !!queryProxy || 配置快照.是否代理已启用,
    回退地址: queryFallback || 配置快照.回退地址,
    当前工作器地区: queryRegion || 配置快照.当前工作器地区,
    启用地区匹配: queryRegionMatch ?? 配置快照.启用地区匹配 };
  function 处理值远程写入器() {
    try {
      remote.writer?.releaseLock();
    } catch {}
    remote.writer = null;
  }
  function 关闭传输() {
    if (传输值) return;
    传输值 = true;
    连接取消.abort();
    值队列.clear();
    处理值远程写入器();
    closeWebSocket(websocket);
  }
  // A stream abort waits for an in-flight write; cancel pending dials directly.
  websocket.addEventListener('close', 关闭传输);
  websocket.addEventListener('error', 关闭传输);
  function 处理队列值(chunk) {
    const data = asBytes(chunk);
    if (!data.byteLength) return true;
    if (!值队列.sow(data)) {
      关闭传输();
      return false;
    }
    remote.drainUpload();
    return true;
  }
  async function drainUpload() {
    if (drainingUpload || 传输值 || !remote.writer) return;
    drainingUpload = true;
    try {
      for (;;) {
        if (传输值 || !remote.writer) break;
        const data = 值队列.bundle();
        if (!data) break;
        await remote.writer.write(data);
      }
    } catch {
      关闭传输();
    } finally {
      drainingUpload = false;
      if (!值队列.empty && !传输值 && remote.writer) queueMicrotask(drainUpload);
    }
  }
  remote.drainUpload = () => {
    if (!drainingUpload && !值队列.empty && remote.writer) queueMicrotask(drainUpload);
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || '';
  const inbound = webSocketReadable(websocket, earlyDataHeader);
  inbound.pipeTo(new WritableStream({
    close() { 关闭传输(); },
    abort() { 关闭传输(); },
    async write(chunk) {
      if (传输值) return;
      const data = asBytes(chunk);
      if (是否域名系统值) return await forwardDNS(data, websocket, null, fetcher, 出站配置, 连接取消.signal);
      if (remote.socket && remote.writer) {
        if (!处理队列值(data)) throw new Error('upload queue overflow');
        return;
      }
      if (协议类型) {
        if (!处理队列值(data)) throw new Error('upload queue overflow');
        return;
      }
      if (启用明文 && data.byteLength >= 24) {
        const 轻量协议结果 = parseVlessHeader(data, 认证令牌);
        if (!轻量协议结果.hasError) {
          协议类型 = "vless";
          const {
            port: port,
            hostname: hostname,
            rawIndex: 原始索引,
            version: version,
            isUDP: isUDP
          } = 轻量协议结果;
          if (isUDP) {
            if (port === 53) 是否域名系统值 = true;else throw new Error(错误_仅支持域名系统用户数据报);
          }
          const responseHeader = new Uint8Array([version[0], 0]);
          const payload = data.subarray(原始索引);
          if (是否域名系统值) return forwardDNS(payload, websocket, responseHeader, fetcher, 出站配置, 连接取消.signal);
          await connectWebSocketTCP(hostname, port, payload, websocket, responseHeader, remote, fetcher, 出站配置, 连接取消.signal);
          return;
        }
      }
      if (启用木马 && data.byteLength >= 56) {
        const 值结果 = await parseTrojanHeader(data, 认证令牌, 传输路径);
        if (!值结果.hasError) {
          协议类型 = "trojan";
          const {
            port: port,
            hostname: hostname,
            rawClientData: 原始客户端数据
          } = 值结果;
          await connectWebSocketTCP(hostname, port, 原始客户端数据, websocket, null, remote, fetcher, 出站配置, 连接取消.signal);
          return;
        }
      }
      throw new Error('Invalid protocol or authentication failed');
    }
  })).catch(关闭传输);
  return new Response(null, {
    status: 101,
    webSocket: 客户端值
  });
}
async function connectWebSocketTCP(主机, 端口数字, 原始数据, websocket, responseHeader, 远程连接值, fetcher, 配置快照, signal) {
  const attempts = outboundAttempts(配置快照, 主机, 端口数字, () => 获取回退目标(
    配置快照.回退地址, 配置快照.当前工作器地区, 配置快照.启用地区匹配, 端口数字));
  const payload = asBytes(原始数据);
  async function 连接值发送(address, port, 值代理 = false) {
    // 走代理时首包交给握手函数在释放写入器前发出，避免换写入器导致连接被重置
    const socket = await dialOutbound(address, port, payload, fetcher, 配置快照.已解析代理5配置, 值代理, signal);
    const writer = socket.writable.getWriter();
    return {
      remoteSock: socket,
      writer: writer
    };
  }
  function 处理值值当前(socket, writer) {
    if (远程连接值.socket !== socket) return;
    try {
      writer?.releaseLock();
    } catch {}
    远程连接值.socket = null;
    远程连接值.writer = null;
  }
  function 处理值远程(socket, writer, retry) {
    try {
      if (远程连接值.writer && 远程连接值.writer !== writer) {
        远程连接值.writer.releaseLock();
      }
    } catch {}
    远程连接值.socket = socket;
    远程连接值.writer = writer;
    远程连接值.drainUpload?.();
    socket.closed.catch(() => {}).finally(() => {
      if (远程连接值.socket === socket) closeWebSocket(websocket);
    });
    relayToWebSocket(socket, websocket, responseHeader, retry).finally(() => {
      if (远程连接值.socket === socket) {
        try {
          writer.releaseLock();
        } catch {}
        远程连接值.writer = null;
      }
    });
  }
  async function connectNext() {
    while (!signal.aborted) {
      const { value: attempt, done } = await attempts.next();
      if (done) { closeWebSocket(websocket); return; }
      try {
        const { remoteSock, writer } = await 连接值发送(attempt.address, attempt.port, attempt.viaProxy);
        处理值远程(remoteSock, writer, attempt.first ? () => {
          处理值值当前(remoteSock, writer);
          connectNext();
        } : null);
        return;
      } catch {}
    }
  }
  await connectNext();
}
function asBytes(chunk) {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return new Uint8Array(chunk);
}
function concatBytes(first, second) {
  const firstBytes = asBytes(first);
  const secondBytes = asBytes(second);
  const result = new Uint8Array(firstBytes.byteLength + secondBytes.byteLength);
  result.set(firstBytes);
  result.set(secondBytes, firstBytes.byteLength);
  return result;
}
function createUploadQueue(chunkSize, maxBytes = chunkSize, 项目列表上限 = Math.max(1, maxBytes >> 8)) {
  let 队列 = [];
  let head = 0;
  let queuedBytes = 0;
  let buffer = null;
  function compact() {
    if (head > 32 && head * 2 >= 队列.length) {
      队列 = 队列.slice(head);
      head = 0;
    }
  }
  function shift() {
    if (head >= 队列.length) return null;
    const data = 队列[head];
    队列[head++] = undefined;
    queuedBytes -= data.byteLength;
    compact();
    return data;
  }
  return {
    get empty() {
      return head >= 队列.length;
    },
    clear() {
      队列 = [];
      head = 0;
      queuedBytes = 0;
    },
    sow(data) {
      const 数量值 = data?.byteLength || 0;
      if (!数量值) return true;
      if (queuedBytes + 数量值 > maxBytes || 队列.length - head >= 项目列表上限) return false;
      队列.push(data);
      queuedBytes += 数量值;
      return true;
    },
    bundle() {
      const firstChunk = shift();
      if (!firstChunk || head >= 队列.length || firstChunk.byteLength >= chunkSize) return firstChunk;
      let totalBytes = firstChunk.byteLength;
      let 结束 = head;
      while (结束 < 队列.length) {
        const nextChunk = 队列[结束];
        const combinedBytes = totalBytes + nextChunk.byteLength;
        if (combinedBytes > chunkSize) break;
        totalBytes = combinedBytes;
        结束++;
      }
      if (结束 === head) return firstChunk;
      const 输出 = buffer ||= new Uint8Array(chunkSize);
      输出.set(firstChunk);
      let offset = firstChunk.byteLength;
      while (head < 结束) {
        const chunk = 队列[head];
        队列[head++] = undefined;
        queuedBytes -= chunk.byteLength;
        输出.set(chunk, offset);
        offset += chunk.byteLength;
      }
      compact();
      return 输出.subarray(0, totalBytes);
    }
  };
}
function createDownloadBatcher(websocket) {
  const bufferSize = 传输下载包大小;
  const 尾部 = 传输下载尾部;
  const minBatchSize = Math.max(4096, 尾部 << 3);
  let buffer = new Uint8Array(bufferSize);
  let 值字节 = 0;
  let 计时器 = 0;
  let scheduled = false;
  let writeVersion = 0;
  let 值键 = 0;
  let deferrals = 0;
  function 刷新() {
    if (计时器) clearTimeout(计时器);
    计时器 = 0;
    scheduled = false;
    if (!值字节) return;
    if (websocket.readyState === 1) websocket.send(buffer.subarray(0, 值字节).slice());
    buffer = new Uint8Array(bufferSize);
    值字节 = 0;
    deferrals = 0;
  }
  function 处理本地值() {
    if (计时器 || scheduled) return;
    scheduled = true;
    值键 = writeVersion;
    queueMicrotask(() => {
      scheduled = false;
      if (!值字节 || 计时器) return;
      if (bufferSize - 值字节 < 尾部) return 刷新();
      计时器 = setTimeout(() => {
        计时器 = 0;
        if (!值字节) return;
        if (bufferSize - 值字节 < 尾部) return 刷新();
        if (deferrals < 2 && (writeVersion !== 值键 || 值字节 < minBatchSize)) {
          deferrals++;
          值键 = writeVersion;
          return 处理本地值();
        }
        刷新();
      }, Math.max(传输下载延迟, 1));
    });
  }
  return {
    send(chunk) {
      const data = asBytes(chunk);
      let offset = 0;
      const length = data.byteLength;
      if (!length) return;
      while (offset < length) {
        if (!值字节 && length - offset >= bufferSize) {
          const sendSize = Math.min(bufferSize, length - offset);
          if (websocket.readyState === 1) websocket.send(offset || sendSize !== length ? data.subarray(offset, offset + sendSize) : data);
          offset += sendSize;
          continue;
        }
        const copySize = Math.min(bufferSize - 值字节, length - offset);
        buffer.set(data.subarray(offset, offset + copySize), 值字节);
        值字节 += copySize;
        offset += copySize;
        writeVersion++;
        if (值字节 === bufferSize || bufferSize - 值字节 < 尾部) 刷新();else 处理本地值();
      }
    },
    flush: 刷新
  };
}
function openSocket(address, port, fetcher, open) {
  const 目标 = {
    hostname: address,
    port: port
  };
  return open(() => fetcher && typeof fetcher.connect === 'function' ? fetcher.connect(目标) : 连接(目标));
}
async function openSocketWithFallback(address, port, fetcher, open, close) {
  let socket;
  try {
    socket = openSocket(address, port, fetcher, open);
    if (socket?.opened) await socket.opened;
    return socket;
  } catch (error) {
    if (socket) close(socket);
    if (!fetcher) throw error;
    const fallbackSocket = open(() => 连接({
      hostname: address,
      port: port
    }));
    if (fallbackSocket?.opened) await fallbackSocket.opened;
    return fallbackSocket;
  }
}
async function raceSockets(address, port, fetcher, 竞速数量, open, close) {
  const 数量 = Math.max(1, 竞速数量 | 0);
  const 待连接 = new Set();
  let 已选定 = false;
  const 跟踪打开 = create => {
    if (已选定) throw new Error('Connection race finished');
    const socket = open(create); 待连接.add(socket); return socket;
  };
  const attempts = Array.from({
    length: 数量
  }, () => openSocketWithFallback(address, port, fetcher, 跟踪打开, close));
  const winner = await Promise.any(attempts);
  已选定 = true;
  for (const socket of 待连接) if (socket !== winner) close(socket);
  // A fetcher failure can start its global fallback after another attempt won.
  attempts.forEach(promise => promise.then(socket => {
    if (socket !== winner) close(socket);
  }, () => {}));
  return winner;
}
function dialOutbound(address, port, data, fetcher, proxy, viaProxy, signal, races = 传输连接竞速数) {
  return withConnectionDeadline(async (open, close) => {
    if (viaProxy) return connectSOCKS(address, port, proxy, fetcher, data, open);
    const socket = await raceSockets(address, port, fetcher, races, open, close);
    if (data?.byteLength) {
      const writer = socket.writable.getWriter();
      try { await writer.write(data); } finally { writer.releaseLock(); }
    }
    return socket;
  }, signal);
}
function getUUIDBytes(token) {
  if (唯一标识字节缓存.has(token)) return 唯一标识字节缓存.get(token);
  const 十六进制 = String(token || '').replace(/-/g, '');
  if (十六进制.length !== 32) return null;
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index++) {
    const byte = Number.parseInt(十六进制.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[index] = byte;
  }
  if (唯一标识字节缓存.size > 16) 唯一标识字节缓存.clear();
  唯一标识字节缓存.set(token, bytes);
  return bytes;
}
function matchesUUID(bytes, offset, token) {
  const id = getUUIDBytes(token);
  return !!id && id.every((byte, index) => bytes[offset + index] === byte);
}
function parseVlessHeader(packet, 令牌) {
  const bytes = asBytes(packet);
  if (bytes.byteLength < 24) return { hasError: true };
  const version = bytes.subarray(0, 1);
  if (!matchesUUID(bytes, 1, 令牌)) return { hasError: true };
  const optionsLength = bytes[17];
  const 命令索引 = 18 + optionsLength;
  if (bytes.byteLength < 命令索引 + 5) return { hasError: true };
  const command = bytes[命令索引];
  let 是否用户数据报 = false;
  if (command === 1) {} else if (command === 2) {
    是否用户数据报 = true;
  } else {
    return { hasError: true };
  }
  const portIndex = 19 + optionsLength;
  const port = bytes[portIndex] << 8 | bytes[portIndex + 1];
  let addressIndex = portIndex + 2,
    addressLength = 0,
    地址值索引 = addressIndex + 1,
    hostname = '';
  const addressType = bytes[addressIndex];
  switch (addressType) {
    case 地址类型_四版:
      addressLength = 4;
      if (bytes.byteLength < 地址值索引 + addressLength) return { hasError: true };
      hostname = `${bytes[地址值索引]}.${bytes[地址值索引 + 1]}.${bytes[地址值索引 + 2]}.${bytes[地址值索引 + 3]}`;
      break;
    case 地址类型_网址:
      if (bytes.byteLength < 地址值索引 + 1) return { hasError: true };
      addressLength = bytes[地址值索引++];
      if (bytes.byteLength < 地址值索引 + addressLength) return { hasError: true };
      hostname = 共享解码器.decode(bytes.subarray(地址值索引, 地址值索引 + addressLength));
      break;
    case 地址类型_六版:
      addressLength = 16;
      if (bytes.byteLength < 地址值索引 + addressLength) return { hasError: true };
      const segments = [];
      const addressView = new DataView(bytes.buffer, bytes.byteOffset + 地址值索引, addressLength);
      for (let index = 0; index < 8; index++) segments.push(addressView.getUint16(index * 2).toString(16));
      hostname = segments.join(':');
      break;
    default:
      return { hasError: true };
  }
  if (!hostname) return { hasError: true };
  return {
    hasError: false,
    port: port,
    hostname: hostname,
    isUDP: 是否用户数据报,
    rawIndex: 地址值索引 + addressLength,
    version: version
  };
}
function webSocketReadable(websocket, 值数据头部) {
  let cancelled = false;
  return new ReadableStream({
    start(controller) {
      websocket.addEventListener('message', 事件 => {
        if (!cancelled) controller.enqueue(asBytes(事件.data));
      });
      websocket.addEventListener('close', () => {
        if (!cancelled) {
          closeWebSocket(websocket);
          controller.close();
        }
      });
      websocket.addEventListener('error', error => controller.error(error));
      const {
        earlyData: 值数据,
        error: error
      } = decodeEarlyData(值数据头部);
      if (error) controller.error(error);else if (值数据) controller.enqueue(asBytes(值数据));
    },
    cancel() {
      cancelled = true;
      closeWebSocket(websocket);
    }
  });
}
async function relayToWebSocket(远程套接字, websocket, 头部数据, 重试值) {
  let responseHeader = 头部数据,
    是否有数据 = false,
    failedOrRetried = false;

  // 关键：直连有时握手成功但远端长时间无数据，需要超时触发降级
  let 首次字节计时器 = null;
  if (重试值) {
    首次字节计时器 = setTimeout(() => {
      if (!是否有数据 && !failedOrRetried) {
        failedOrRetried = true;
        try {
          远程套接字.close && 远程套接字.close();
        } catch {}
        重试值();
      }
    }, 首字节超时);
  }
  const batcher = createDownloadBatcher(websocket);
  let reader = null;
  let byob = true;
  let buffer = new ArrayBuffer(传输块大小);
  try {
    try {
      reader = 远程套接字.readable.getReader({
        mode: 'byob'
      });
    } catch {
      byob = false;
      reader = 远程套接字.readable.getReader();
    }
    for (;;) {
      const result = byob ? await reader.read(new Uint8Array(buffer, 0, 传输块大小)) : await reader.read();
      if (result.done) break;
      const 读取值 = result.value;
      let chunk = asBytes(读取值);
      const 值缓冲 = byob && 读取值?.buffer instanceof ArrayBuffer && 读取值.buffer.byteLength >= 传输块大小 ? 读取值.buffer : new ArrayBuffer(传输块大小);
      if (!chunk.byteLength) continue;
      if (!是否有数据) {
        是否有数据 = true;
        if (首次字节计时器) {
          clearTimeout(首次字节计时器);
          首次字节计时器 = null;
        }
      }
      if (websocket.readyState !== 1) throw new Error(错误_网页套接字未打开);
      if (responseHeader) {
        chunk = concatBytes(responseHeader, chunk);
        responseHeader = null;
      }
      if (chunk.byteLength >= 传输块大小 >> 1) {
        batcher.flush();
        websocket.send(chunk);
        if (byob) buffer = new ArrayBuffer(传输块大小);
      } else {
        batcher.send(chunk.slice());
        if (byob) buffer = 值缓冲;
      }
    }
    batcher.flush();
  } catch {
    // 已经触发 retry 时不要关闭 WS（retry 会重新挂载新 socket）
    if (!failedOrRetried) closeWebSocket(websocket);
  } finally {
    try {
      batcher.flush();
    } catch {}
    try {
      reader?.releaseLock();
    } catch {}
  }
  if (首次字节计时器) {
    clearTimeout(首次字节计时器);
    首次字节计时器 = null;
  }
  if (!是否有数据 && !failedOrRetried && 重试值) 重试值();
}
async function forwardDNS(用户数据报块, 网页套接字, 值头部, 请求值, 配置快照, signal) {
  for await (const attempt of outboundAttempts(配置快照, '8.8.4.4', 53)) {
    if (signal.aborted) break;
    let socket;
    try {
      socket = await dialOutbound(attempt.address, attempt.port, 用户数据报块, 请求值,
        配置快照.已解析代理5配置, attempt.viaProxy, signal, 1);
      await relayToWebSocket(socket, 网页套接字, 值头部, null);
      return;
    } catch {}
    finally { try { socket?.close(); } catch {} }
  }
  closeWebSocket(网页套接字);
}
async function connectSOCKS(address, port, 代理配置, fetcher, 首包数据, open) {
  // 按代理种类分派：隧道走建隧请求，其余保持套接字5 握手
  if (代理配置 && (代理配置.kind === 代理种类_隧道 || 代理配置.kind === 代理种类_安全隧道)) {
    return connectHTTP(address, port, 代理配置, fetcher, 首包数据, open);
  }
  const {
    username: username,
    password: password,
    hostname: proxyHost,
    socksPort: proxyPort
  } = 代理配置;
  // 优先用请求自带的 fetcher 建连，回退到全局连接
  const socket = openSocket(proxyHost, proxyPort, fetcher, open);
  let writer = null;
  let reader = null;
  try {
    if (socket.opened) await socket.opened;
    writer = socket.writable.getWriter();
    await writer.write(new Uint8Array(username ? [5, 2, 0, 2] : [5, 1, 0]));
    reader = socket.readable.getReader();
    // 响应可能分片到达，按需累积到足够长度再解析；残留字节留给下一步
    let 残留字节 = new Uint8Array(0);
    async function 读满(需要长度) {
      while (残留字节.length < 需要长度) {
        const { value: 分片, done: 已结束 } = await reader.read();
        if (已结束 || !分片) throw new Error(错误_代理连接失败);
        残留字节 = concatBytes(残留字节, 分片);
      }
      return 残留字节;
    }
    function 取走(长度) {
      const 结果 = 残留字节.subarray(0, 长度);
      残留字节 = 残留字节.subarray(长度);
      return 结果;
    }
    let reply = await 读满(2);
    if (reply[0] !== 5 || reply[1] === 255) throw new Error(错误_代理无可用方法);
    const 选中方法 = reply[1];
    取走(2);
    if (选中方法 === 2) {
      if (!username || !password) throw new Error(错误_代理需要认证);
      const encoder = new TextEncoder();
      const 用户字节 = encoder.encode(username), 密码字节 = encoder.encode(password);
      if (用户字节.length > 255 || 密码字节.length > 255) throw new Error(错误_代理认证失败);
      const 认证请求 = new Uint8Array([1, 用户字节.length, ...用户字节, 密码字节.length, ...密码字节]);
      await writer.write(认证请求);
      reply = await 读满(2);
      if (reply[0] !== 1 || reply[1] !== 0) throw new Error(错误_代理认证失败);
      取走(2);
    }
    // 统一用域名型寻址，避免 VLESS / Trojan 不同的地址类型编号影响 SOCKS 握手。
    const encoder = new TextEncoder();
    const 目标字节 = encoder.encode(normalizeTarget(address));
    if (目标字节.length > 255) throw new Error(错误_代理连接失败);
    const targetAddress = new Uint8Array([3, 目标字节.length, ...目标字节]);
    await writer.write(new Uint8Array([5, 1, 0, ...targetAddress, port >> 8, port & 255]));
    // 连接应答长度随绑定地址类型而变，先读固定的 4 字节头再按类型补齐
    reply = await 读满(4);
    if (reply[1] !== 0) throw new Error(错误_代理连接失败);
    const 绑定地址类型 = reply[3];
    let 应答长度;
    if (绑定地址类型 === 1) {
      应答长度 = 10;
    } else if (绑定地址类型 === 4) {
      应答长度 = 22;
    } else if (绑定地址类型 === 3) {
      应答长度 = 7 + (await 读满(5))[4];
    } else {
      throw new Error(错误_代理响应异常);
    }
    await 读满(应答长度);
    取走(应答长度);
    // 首包必须在释放写入器之前发出，与握手共用同一个写入器
    if (首包数据 && 首包数据.byteLength) await writer.write(首包数据);
    writer.releaseLock();
    reader.releaseLock();
    // 应答之后若已捎带目标数据，重新挂回流首部，避免丢首包
    if (残留字节.length) return prependSocket(socket, 残留字节);
    return socket;
  } catch (代理错误) {
    try { writer?.releaseLock(); } catch {}
    try { reader?.releaseLock(); } catch {}
    throw 代理错误;
  }
}
// 六版地址在域名型寻址里不带方括号
function normalizeTarget(address) {
  const 文本 = String(address || '');
  return /^\[.*\]$/.test(文本) ? 文本.slice(1, -1) : 文本;
}
async function connectHTTP(address, port, 代理配置, fetcher, payload, open) {
  const {
    username: 隧道用户,
    password: 隧道密码,
    hostname: 隧道主机,
    socksPort: 隧道端口,
    kind: 隧道种类
  } = 代理配置;
  const 连接选项 = 隧道种类 === 代理种类_安全隧道 ? {
    secureTransport: 'on',
    allowHalfOpen: false
  } : undefined;
  const 目标参数 = {
    hostname: 隧道主机,
    port: 隧道端口
  };
  // 优先用请求自带的 fetcher 建连，回退到全局连接
  const 套接字 = open(() => fetcher && typeof fetcher.connect === 'function' ? (连接选项 === undefined ? fetcher.connect(目标参数) : fetcher.connect(目标参数, 连接选项)) : 连接(目标参数, 连接选项));
  if (套接字?.opened) await 套接字.opened;
  // IPv6 目标在请求行里要带方括号
  const 目标主机 = address.includes(':') && !/^\[.*\]$/.test(address) ? `[${address}]` : address;
  const 目标地址 = `${目标主机}:${port}`;
  let 请求头 = `${文本_连接方法} ${目标地址}${文本_协议版本}${文本_换行}` + `${文本_主机头}${目标地址}${文本_换行}` + `${文本_用户代理头}${文本_换行}` + `${文本_代理保持}${文本_换行}`;
  if (隧道用户) {
    请求头 += `${文本_代理认证头}${btoa(String.fromCharCode(...new TextEncoder().encode(`${隧道用户}:${隧道密码 || ''}`)))}${文本_换行}`;
  }
  请求头 += 文本_换行;
  const 写入器 = 套接字.writable.getWriter();
  const 读取器 = 套接字.readable.getReader();
  try {
    await 写入器.write(new TextEncoder().encode(请求头));
    // 响应可能分片到达，累积到头部结束（空行）为止
    const 分隔 = [13, 10, 13, 10];
    let 缓冲 = new Uint8Array(0);
    let 头部结束 = -1;
    while (头部结束 < 0) {
      const {
        value: 分片,
        done: 已结束
      } = await 读取器.read();
      if (已结束 || !分片) throw new Error(错误_代理隧道失败);
      缓冲 = concatBytes(缓冲, 分片);
      for (let 位置 = 0; 位置 + 3 < 缓冲.length; 位置++) {
        if (缓冲[位置] === 分隔[0] && 缓冲[位置 + 1] === 分隔[1] && 缓冲[位置 + 2] === 分隔[2] && 缓冲[位置 + 3] === 分隔[3]) {
          头部结束 = 位置 + 4;
          break;
        }
      }
      if (头部结束 < 0 && 缓冲.length > 8192) throw new Error(错误_代理响应异常);
    }
    const 状态行 = 共享解码器.decode(缓冲.subarray(0, Math.min(头部结束, 128)));
    if (!状态行.startsWith(文本_响应前缀)) throw new Error(错误_代理响应异常);
    const 状态码 = Number(状态行.split(' ')[1]);
    if (!(状态码 >= 200 && 状态码 < 300)) throw new Error(错误_代理隧道失败);
    // 代理在头部之后可能已经捎带了目标数据，需要交还给下游
    const 残留数据 = 缓冲.subarray(头部结束);
    // 首包在释放写入器之前发出
    if (payload && payload.byteLength) await 写入器.write(payload);
    写入器.releaseLock();
    读取器.releaseLock();
    if (残留数据.byteLength) return prependSocket(套接字, 残留数据);
    return 套接字;
  } catch (隧道错误) {
    try {
      写入器.releaseLock();
    } catch {}
    try {
      读取器.releaseLock();
    } catch {}
    throw 隧道错误;
  }
}
// 把建隧响应里捎带的目标数据重新挂回可读流首部
function prependSocket(套接字, 残留数据) {
  let 上游读取器 = null;
  const 新可读 = new ReadableStream({
    start(控制器) {
      控制器.enqueue(残留数据);
      上游读取器 = 套接字.readable.getReader();
    },
    async pull(控制器) {
      const {
        value: 分片,
        done: 已结束
      } = await 上游读取器.read();
      if (已结束) {
        控制器.close();
        return;
      }
      控制器.enqueue(分片);
    },
    cancel(原因) {
      try {
        上游读取器?.cancel(原因);
      } catch {}
    }
  });
  return {
    readable: 新可读,
    writable: 套接字.writable,
    closed: 套接字.closed,
    opened: 套接字.opened,
    close: () => 套接字.close()
  };
}

async function parseTrojanHeader(packet, token, 传输路径 = '') {
  const 字节 = asBytes(packet);
  const 密码值井号 = 传输路径 || token;
  const expectedHash = await sha224(密码值井号);
  if (字节.byteLength < 56) {
    return { hasError: true };
  }
  let 值值索引 = 56;
  if (字节[56] !== 0x0d || 字节[57] !== 0x0a) {
    return { hasError: true };
  }
  const passwordHash = 共享解码器.decode(字节.subarray(0, 值值索引));
  if (passwordHash !== expectedHash) {
    return { hasError: true };
  }
  const requestData = 字节.subarray(值值索引 + 2);
  if (requestData.byteLength < 6) {
    return { hasError: true };
  }
  const view = new DataView(requestData.buffer, requestData.byteOffset, requestData.byteLength);
  const command = view.getUint8(0);
  if (command !== 1) {
    return { hasError: true };
  }
  const addressType = view.getUint8(1);
  let 地址长度 = 0;
  let addressOffset = 2;
  let hostname = "";
  switch (addressType) {
    case 1:
      地址长度 = 4;
      hostname = requestData.subarray(addressOffset, addressOffset + 地址长度).join(".");
      break;
    case 3:
      地址长度 = requestData[addressOffset];
      addressOffset += 1;
      hostname = 共享解码器.decode(requestData.subarray(addressOffset, addressOffset + 地址长度));
      break;
    case 4:
      地址长度 = 16;
      const 数据视图 = new DataView(requestData.buffer, requestData.byteOffset + addressOffset, 地址长度);
      const segments = [];
      for (let index = 0; index < 8; index++) {
        segments.push(数据视图.getUint16(index * 2).toString(16));
      }
      hostname = segments.join(":");
      break;
    default:
      return { hasError: true };
  }
  if (!hostname) {
    return { hasError: true };
  }
  const portOffset = addressOffset + 地址长度;
  const 端口远程 = new DataView(requestData.buffer, requestData.byteOffset + portOffset, 2).getUint16(0);
  return {
    hasError: false,
    port: 端口远程,
    hostname: hostname,
    rawClientData: requestData.subarray(portOffset + 4)
  };
}
async function sha224(text) {
  const 编码器 = new TextEncoder();
  const message = 编码器.encode(text);
  const roundConstants = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let 头部游标 = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
  const 消息长度 = message.length;
  const bitLength = 消息长度 * 8;
  const paddedLength = Math.ceil((消息长度 + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[消息长度] = 0x80;
  const 视图 = new DataView(padded.buffer);
  视图.setUint32(paddedLength - 4, bitLength, false);
  for (let blockOffset = 0; blockOffset < paddedLength; blockOffset += 64) {
    const 写入器包装 = new Uint32Array(64);
    for (let index = 0; index < 16; index++) {
      写入器包装[index] = 视图.getUint32(blockOffset + index * 4, false);
    }
    for (let index = 16; index < 64; index++) {
      const sigma0 = rotateRight(写入器包装[index - 15], 7) ^ rotateRight(写入器包装[index - 15], 18) ^ 写入器包装[index - 15] >>> 3;
      const sigma1 = rotateRight(写入器包装[index - 2], 17) ^ rotateRight(写入器包装[index - 2], 19) ^ 写入器包装[index - 2] >>> 10;
      写入器包装[index] = 写入器包装[index - 16] + sigma0 + 写入器包装[index - 7] + sigma1 >>> 0;
    }
    let [a, 乙值, c, d, e, 表单值, g, h] = 头部游标;
    for (let round = 0; round < 64; round++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = e & 表单值 ^ ~e & g;
      const temp1 = h + sum1 + choice + roundConstants[round] + 写入器包装[round] >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = a & 乙值 ^ a & c ^ 乙值 & c;
      const temp2 = sum0 + majority >>> 0;
      h = g;
      g = 表单值;
      表单值 = e;
      e = d + temp1 >>> 0;
      d = c;
      c = 乙值;
      乙值 = a;
      a = temp1 + temp2 >>> 0;
    }
    头部游标[0] = 头部游标[0] + a >>> 0;
    头部游标[1] = 头部游标[1] + 乙值 >>> 0;
    头部游标[2] = 头部游标[2] + c >>> 0;
    头部游标[3] = 头部游标[3] + d >>> 0;
    头部游标[4] = 头部游标[4] + e >>> 0;
    头部游标[5] = 头部游标[5] + 表单值 >>> 0;
    头部游标[6] = 头部游标[6] + g >>> 0;
    头部游标[7] = 头部游标[7] + h >>> 0;
  }
  const digest = [];
  for (let index = 0; index < 7; index++) {
    digest.push((头部游标[index] >>> 24 & 0xff).toString(16).padStart(2, '0'), (头部游标[index] >>> 16 & 0xff).toString(16).padStart(2, '0'), (头部游标[index] >>> 8 & 0xff).toString(16).padStart(2, '0'), (头部游标[index] & 0xff).toString(16).padStart(2, '0'));
  }
  return digest.join('');
}
function rotateRight(value, bits) {
  return value >>> bits | value << 32 - bits;
}
let activeXHTTPConnections = 0;
const 值超文本缓冲大小 = 128 * 1024;
const 连接超时值 = 5000;

const 上限值 = 32;





async function readXHTTPHeader(body, 唯一标识字符串, signal) {
  const reader = body.getReader({
    mode: 'byob'
  });
  let 已超时 = false;
  const abort = () => { reader.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const 超时标识 = setTimeout(() => {
    已超时 = true;
    reader.cancel().catch(() => {});
  }, 连接超时值);
  try {
    let result = await reader.readAtLeast(1 + 16 + 1, new Uint8Array(值超文本缓冲大小));
    if (!result.value || result.value.length < 1 + 16 + 1) {
      throw new Error('header too short');
    }
    let bufferedLength = 0;
    let 索引 = 0;
    let 缓存 = result.value;
    bufferedLength += result.value.length;
    const version = 缓存[0];
    if (!matchesUUID(缓存, 1, 唯一标识字符串)) {
      throw new Error(`invalid UUID`);
    }
    const optionsLength = 缓存[1 + 16];
    const addressOffset = 1 + 16 + 1 + optionsLength + 1 + 2 + 1;
    if (addressOffset + 1 > bufferedLength) {
      if (result.done) {
        throw new Error(`header too short`);
      }
      索引 = addressOffset + 1 - bufferedLength;
      result = await reader.readAtLeast(索引, new Uint8Array(值超文本缓冲大小));
      if (!result.value || result.value.length < 索引) {
        throw new Error('header too short');
      }
      bufferedLength += result.value.length;
      缓存 = concatBytes(缓存, result.value);
    }
    const 命令 = 缓存[1 + 16 + 1 + optionsLength];
    if (命令 !== 1) {
      throw new Error(`unsupported command: ${命令}`);
    }
    const port = (缓存[addressOffset - 1 - 2] << 8) + 缓存[addressOffset - 1 - 1];
    const addressType = 缓存[addressOffset - 1];
    let 头部长度 = -1;
    if (addressType === 地址类型_四版) {
      头部长度 = addressOffset + 4;
    } else if (addressType === 地址类型_六版) {
      头部长度 = addressOffset + 16;
    } else if (addressType === 地址类型_网址) {
      头部长度 = addressOffset + 1 + 缓存[addressOffset];
    }
    if (头部长度 < 0) {
      throw new Error('read address type failed');
    }
    索引 = 头部长度 - bufferedLength;
    if (索引 > 0) {
      if (result.done) {
        throw new Error(`read address failed`);
      }
      result = await reader.readAtLeast(索引, new Uint8Array(值超文本缓冲大小));
      if (!result.value || result.value.length < 索引) {
        throw new Error('read address failed');
      }
      bufferedLength += result.value.length;
      缓存 = concatBytes(缓存, result.value);
    }
    let hostname = '';
    索引 = addressOffset;
    switch (addressType) {
      case 地址类型_四版:
        hostname = 缓存.slice(索引, 索引 + 4).join('.');
        break;
      case 地址类型_网址:
        hostname = new TextDecoder().decode(缓存.slice(索引 + 1, 索引 + 1 + 缓存[索引]));
        break;
      case 地址类型_六版:
        hostname = 缓存.slice(索引, 索引 + 16).reduce((字符串值, byte, index, 甲值) => index % 2 ? 字符串值.concat(((甲值[index - 1] << 8) + byte).toString(16)) : 字符串值, []).join(':');
        break;
    }
    if (hostname.length < 1) {
      throw new Error('failed to parse hostname');
    }
    const 数据 = 缓存.slice(头部长度);
    return {
      hostname: hostname,
      port: port,
      data: 数据,
      resp: new Uint8Array([version, 0]),
      reader: reader,
      done: result.done
    };
  } catch (error) {
    try { await reader.cancel(); } catch {}
    try {
      reader.releaseLock();
    } catch {}
    if (已超时) throw new DOMException('XHTTP header timeout', 'TimeoutError');
    throw error;
  } finally {
    clearTimeout(超时标识);
    signal?.removeEventListener('abort', abort);
  }
}

// XHTTP 沿用 WS 的出站策略；其回退由建连失败触发，WS 另有首字节超时重试。
async function connectXHTTP(首包, 请求值扩展, 配置快照, signal) {
  const attempts = outboundAttempts(配置快照, 首包.hostname, 首包.port, () => 获取回退目标(
    配置快照.回退地址, 配置快照.当前工作器地区, 配置快照.启用地区匹配, 首包.port));
  for await (const attempt of attempts) {
    if (signal?.aborted) break;
    try {
      const socket = await dialOutbound(attempt.address, attempt.port, null, 请求值扩展,
        配置快照.已解析代理5配置, attempt.viaProxy, signal);
      return createXHTTPRelay(首包, socket, 45_000, signal);
    } catch {}
  }
  return null;
}
async function handleXHTTPBody(body, 唯一标识, 请求值扩展, 配置快照, signal) {
  if (activeXHTTPConnections >= 上限值) {
    return new Response('Too many connections', {
      status: 429
    });
  }
  activeXHTTPConnections++;
  let released = false;
  const releaseSlot = () => {
    if (!released) {
      activeXHTTPConnections = Math.max(0, activeXHTTPConnections - 1);
      released = true;
    }
  };
  let 首包;
  let 已交付连接 = false;
  try {
    首包 = await readXHTTPHeader(body, 唯一标识, signal);
    const 远程连接 = await connectXHTTP(首包, 请求值扩展, 配置快照, signal);
    if (远程连接 === null) {
      return null;
    }
    const 连接值 = 远程连接.closed.finally(releaseSlot);
    已交付连接 = true;
    return {
      readable: 远程连接.readable,
      closed: 连接值
    };
  } catch (error) {
    if (error.name === 'TimeoutError') return new Response('XHTTP header timeout', { status: 408 });
    return null;
  } finally {
    if (!已交付连接) {
      releaseSlot();
      if (首包?.reader) {
        try { await 首包.reader.cancel(); } catch {}
        try { 首包.reader.releaseLock(); } catch {}
      }
    }
  }
}
async function handleXHTTP(request, 配置快照) {

  try {
    return await handleXHTTPBody(request.body, 配置快照.认证令牌, request.fetcher, 配置快照, request.signal);
  } catch {
    return null;
  }
}
function decodeEarlyData(base64) {
  if (!base64) return {
    error: null
  };
  try {
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    return {
      earlyData: Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer,
      error: null
    };
  } catch (error) {
    return {
      error: error
    };
  }
}
function closeWebSocket(套接字) {
  try {
    if (套接字.readyState === 1 || 套接字.readyState === 2) 套接字.close();
  } catch {}
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
