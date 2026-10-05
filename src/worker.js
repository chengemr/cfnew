// CFnew - 终端 v4.0.0
// 版本: v4.0.0
import { connect as 连接 } from 'cloudflare:sockets';
import { decodeBase64Text as 解码64 } from './encoding.js';

import { getConfigStore } from './storage.js';
import { createSettings } from './runtime.js';
import { handleConfig, handlePreferred } from './api.js';
import { parseAddress as 解析地址值端口 } from './preferred.js';
import { parseProxy as 解析代理配置 } from './transports/proxy.js';
import { createXHTTPRelay } from './transports/streams.js';
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
    region: 'CF',
    regionCode: 'CF',
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
const 错误_无效数据 = "invalid data";
const 错误_无效用户 = "invalid user";
const 错误_不支持命令 = "command is not supported";
const 错误_仅支持域名系统用户数据报 = "UDP proxy only enable for DNS which is port 53";
const 错误_无效地址类型 = "invalid addressType";
const 错误_空地址 = "addressValue is empty";
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
  async fetch(请求735, 本地值734, 本地值733) {
    try {
      const 是否网页套接字 = 请求735.headers.get('Upgrade') === "websocket";
      const 是否值732 = 请求735.method === 'POST';
      const 请求网址731 = new URL(请求735.url);
      const 路径值730 = 请求网址731.pathname.split('/').filter(参数值729 => 参数值729);
      if (!(本地值734.C || 本地值734.c) && !是否网页套接字 && !是否值732 && 请求网址731.pathname !== '/') {
        const 值值728 = (本地值734.u || 本地值734.U || '').toLowerCase();
        const 值值727 = (本地值734.d || 本地值734.D || '').toLowerCase();
        const 首次值 = 路径值730[0] || '';
        const 清理值 = 规范化管理路径(值值727);
        const 请求路径 = 请求网址731.pathname.toLowerCase();
        const 自定义路径匹配 = 请求路径 === 清理值 || 请求路径.startsWith(清理值 + '/');
        if (首次值 !== 值值728 && 清理值 && !自定义路径匹配) {
          return new Response('Not Found', {
            status: 404
          });
        }
      }
      const store = getConfigStore(本地值734.C || 本地值734.c);
      const stored = store ? await store.load() : {};
      const settings = createSettings(本地值734, stored);
      const 网址698 = 请求网址731;
      const 管理路由 = 解析管理路由(网址698.pathname, settings.自定义路径, settings.认证令牌);
      if (管理路由 === 'config') return await handleConfig(请求735, 本地值734, store, stored);
      if (管理路由 === 'preferred') return await handlePreferred(请求735, 本地值734, store, stored);
      if (管理路由 === 'invalid-api' && !是否网页套接字) return Response.json({ error: 'Not Found' }, { status: 404 });
      if (请求735.method === 'POST' && settings.启用扩展传输) {
        const { 头: 叉填充头, 键: 叉填充键 } = 获取叉HTTP填充标识(settings.认证令牌);
        if (!校验叉HTTP填充(请求735, 叉填充头, 叉填充键)) {
          return new Response('Bad Request', {
            status: 400
          });
        }
        const 结果值684 = await 处理扩展超文本值(请求735, settings);
        if (结果值684 instanceof Response) return 结果值684;
        if (结果值684) {
          本地值733.waitUntil(结果值684.closed);
          const 响应头684 = {
            'X-Accel-Buffering': 'no',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'User-Agent': 'Go-http-client/2.0',
            'Content-Type': 'application/grpc'
          };
          try {
            const 响应填充 = new URL('https://x.invalid/');
            响应填充.searchParams.set(叉填充键, 生成叉HTTP填充串(100 + Math.floor(Math.random() * 901)));
            响应头684[叉填充头] = 响应填充.toString();
          } catch {}
          return new Response(结果值684.readable, {
            headers: 响应头684
          });
        }
        return new Response('Internal Server Error', {
          status: 500
        });
      }
      if (请求735.headers.get('Upgrade') === "websocket") {
        return await 处理网页套接字请求(请求735, settings);
      }
      if (请求735.method === 'GET') {
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
        if (网址698.pathname === '/') {
          // 检查是否有自定义首页URL配置
          const 自定义值 = settings.config.homepage;
          if (自定义值 && 自定义值.trim()) {
            try {
              // 从自定义URL获取内容
              const 值响应 = await fetch(自定义值.trim(), {
                method: 'GET',
                headers: {
                  'User-Agent': 请求735.headers.get('User-Agent') || 'Mozilla/5.0',
                  'Accept': 请求735.headers.get('Accept') || '*/*',
                  'Accept-Language': 请求735.headers.get('Accept-Language') || 'en-US,en;q=0.9'
                },
                redirect: 'follow'
              });
              if (值响应.ok) {
                // 获取响应内容
                const 内容类型672 = 值响应.headers.get('Content-Type') || 'text/html; charset=utf-8';
                const 内容671 = await 值响应.text();

                // 返回自定义首页内容
                return new Response(内容671, {
                  status: 值响应.status,
                  headers: {
                    'Content-Type': 内容类型672,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                  }
                });
              }
            } catch (错误670) {
              // 如果获取失败，继续使用默认终端页面
              console.error('获取自定义首页失败:', 错误670);
            }
          }
          // 优先检查Cookie中的语言设置
          return renderLanding(请求735, settings.自定义路径);
        }
        if (管理路由 === 'page') return renderDashboard(请求735, settings.认证令牌, {
          config: settings.config, kvEnabled: Boolean(store)
        });
        if (管理路由 === 'subscription') return await 处理订阅请求(settings, 请求735, settings.认证令牌, 网址698);
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
    } catch (错误655) {
      return new Response(错误655.toString(), {
        status: 500
      });
    }
  }
};

async function 处理订阅请求(settings, 请求507, 用户506, 网址505 = null) {
  if (!网址505) 网址505 = new URL(请求507.url);
  const 最终链接列表 = [];
  const 工作器域名504 = 网址505.hostname;
  const 目标503 = (网址505.searchParams.get('target') || 'base64').toLowerCase();
  const 家宽目标 = ['vg', 'jk', "jiakuan"].includes(目标503);
  if (家宽目标 && !settings.启用家宽链式) {
    return new Response('家宽链式没开。去配置管理勾上「开启家宽链式」，或者加环境变量 jk=yes。', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  const 转换目标 = ['clash', 'clashr', 'stash', 'meta', 'clashmeta',
    'vg', 'jk', 'jiakuan', 'surge', 'surge2', 'surge3', 'surge4',
    'quantumult', 'quanx', 'loon', 'singbox', 'sing-box'].includes(目标503);
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
  const 别名命名器502 = createNodeNamer();

  // 如果启用了ECH，使用自定义值
  let 加密客户端问候配置501 = null;
  if (settings.启用加密客户端问候) {
    const 域名系统值500 = settings.自定义域名系统 || 'https://223.5.5.5/dns-query';
    const 加密客户端问候域名499 = settings.自定义加密客户端问候域名 || 'cloudflare-ech.com';
    加密客户端问候配置501 = `${加密客户端问候域名499}+${域名系统值500}`;
  }
  function 添加节点列表来源列表(列表) {
    最终链接列表.push(...generateNodeLinks(节点设置, 列表, 用户506, 工作器域名504, 别名命名器502));
  }
  if (settings.启用原生地址) {
    if (settings.当前工作器地区 === 'CUSTOM') {
      const 原生列表497 = [{
        ip: 工作器域名504,
        isp: '原生地址'
      }];
      添加节点列表来源列表(原生列表497);
    } else {
      try {
        const 原生列表496 = [{
          ip: 工作器域名504,
          isp: '原生地址'
        }];
        添加节点列表来源列表(原生列表496);
      } catch {
        const 值备用地址494 = await 获取值备用地址(settings.当前工作器地区, settings.启用地区匹配);
        if (值备用地址494) {
          const 备用列表493 = [{
            ip: 值备用地址494.domain,
            isp: "ProxyIP-" + settings.当前工作器地区
          }];
          添加节点列表来源列表(备用列表493);
        } else {
          const 原生列表 = [{
            ip: 工作器域名504,
            isp: '原生地址'
          }];
          添加节点列表来源列表(原生列表);
        }
      }
    }
  }
  const 是否有自定义优选 = settings.自定义优选地址列表.length > 0 || settings.自定义优选域名列表.length > 0;
  if (settings.禁用优选) {} else if (是否有自定义优选) {
    if (settings.自定义优选地址列表.length > 0 && settings.启用优选地址) {
      添加节点列表来源列表(settings.自定义优选地址列表);
    }
    if (settings.自定义优选域名列表.length > 0 && settings.启用优选域名) {
      const 自定义域名列表 = settings.自定义优选域名列表.map(丁值492 => ({
        ip: 丁值492.domain,
        port: 丁值492.port,
        isp: 丁值492.name || 丁值492.domain
      }));
      添加节点列表来源列表(自定义域名列表);
    }
  } else {
    if (settings.启用优选域名) {
      const 域名列表 = 直连域名列表.map(ip => ({ ip, isp: ip }));
      添加节点列表来源列表(域名列表);
    }
    if (settings.启用优选地址) {
      if (!settings.优选地址源) {
        try {
          const 值地址列表490 = await 获取值地址列表(settings);
          if (值地址列表490.length > 0) {
            添加节点列表来源列表(值地址列表490);
          }
        } catch {
          const 值备用地址488 = await 获取值备用地址(settings.当前工作器地区, settings.启用地区匹配);
          if (值备用地址488) {
            const 备用列表487 = [{
              ip: 值备用地址488.domain,
              isp: "ProxyIP-" + settings.当前工作器地区
            }];
            添加节点列表来源列表(备用列表487);
          }
        }
      }
    }
    if (settings.启用仓库优选) {
      try {
        const 新地址列表 = await 获取值解析新地址列表(settings);
        if (新地址列表.length > 0) {
          最终链接列表.push(...generateNodeLinks(节点设置, 新地址列表, 用户506, 工作器域名504, 别名命名器502, true));
        }
      } catch {
        const 值备用地址485 = await 获取值备用地址(settings.当前工作器地区, settings.启用地区匹配);
        if (值备用地址485) {
          const 备用列表 = [{
            ip: 值备用地址485.domain,
            isp: "ProxyIP-" + settings.当前工作器地区
          }];
          添加节点列表来源列表(备用列表);
        }
      }
    }
  }
  if (最终链接列表.length === 0) {
    const 错误备注 = "所有节点获取失败";
    const 协议484 = "vless";
    const 错误链接 = `${协议484}://00000000-0000-0000-0000-000000000000@127.0.0.1:80?encryption=none&security=none&type=ws&host=error.com&path=%2F#${encodeURIComponent(错误备注)}`;
    最终链接列表.push(错误链接);
  }
  let 订阅内容;
  let 内容类型483 = 'text/plain; charset=utf-8';
  switch (目标503) {
    case "clash":
    case "clashr":
    case "stash":
    case 'meta':
    case "clashmeta":
      订阅内容 = generateClash(最终链接列表, { dns: settings.自定义域名系统, echDomain: settings.自定义加密客户端问候域名 });
      内容类型483 = 'text/yaml; charset=utf-8';
      break;
    case 'vg':
    case 'jk':
    case "jiakuan":
      try {
        订阅内容 = await generateResidential(最终链接列表, { dns: settings.自定义域名系统, echDomain: settings.自定义加密客户端问候域名 });
      } catch (错误) {
        return new Response('家宽节点暂时拉不到：' + (错误 && 错误.message ? 错误.message : 错误) + '\n过几分钟再更新，客户端会先用着上一份。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
      内容类型483 = 'text/yaml; charset=utf-8';
      break;
    case "surge":
    case "surge2":
    case "surge3":
    case "surge4":
      订阅内容 = generateSurge(最终链接列表, { dns: settings.自定义域名系统 });
      内容类型483 = 'text/plain; charset=utf-8';
      break;
    case "quantumult":
    case "quanx":
      订阅内容 = generateQuantumultX(最终链接列表, { dns: settings.自定义域名系统 });
      break;
    case "loon":
      订阅内容 = generateLoon(最终链接列表, { dns: settings.自定义域名系统 });
      内容类型483 = 'text/plain; charset=utf-8';
      break;
    case "singbox":
    case "sing-box":
      订阅内容 = generateSingBox(最终链接列表, { dns: settings.自定义域名系统 });
      内容类型483 = 'application/json; charset=utf-8';
      break;
    default:
      订阅内容 = btoa(最终链接列表.join('\n'));
  }
  const 响应头部列表 = {
    'Content-Type': 内容类型483,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
  };

  // 添加ECH状态到响应头
  if (settings.启用加密客户端问候) {
    响应头部列表['X-ECH-Status'] = 'ENABLED';
    if (加密客户端问候配置501) {
      响应头部列表['X-ECH-Config-Length'] = String(加密客户端问候配置501.length);
    }
  }
  return new Response(订阅内容, {
    headers: 响应头部列表
  });
}

async function 计算值摘要(文本434) {
  const 缓冲区434 = await crypto.subtle.digest('MD5', new TextEncoder().encode(文本434));
  return Array.from(new Uint8Array(缓冲区434)).map(字节434 => 字节434.toString(16).padStart(2, '0')).join('');
}
async function 获取值地址列表(settings) {
  const 分组线路映射 = {
    ctcc: '电信',
    cucc: '联通',
    cmcc: '移动',
    bgp: '多线',
    ipv6: 'IPv6'
  };
  const 值4已启用 = settings.config.ipv4 !== 'no';
  const 值6已启用 = settings.config.ipv6 !== 'no';
  const 值值432 = settings.config.ispMobile !== 'no';
  const 值值431 = settings.config.ispUnicom !== 'no';
  const 值值430 = settings.config.ispTelecom !== 'no';
  try {
    const 时间戳434 = String(Date.now());
    const 内层摘要434 = await 计算值摘要(解码64('RGRsVHh0TjBzVU91'));
    const 请求密钥434 = await 计算值摘要(内层摘要434 + 解码64('NzBjbG91ZGZsYXJlYXBpa2V5') + 时间戳434);
    const 响应434 = await fetch(`${解码64('aHR0cHM6Ly9hcGkudW91aW4uY29tL2luZGV4LnBocC9pbmRleC9DbG91ZGZsYXJl')}?key=${请求密钥434}&time=${时间戳434}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!响应434.ok) return [];
    const 数据434 = await 响应434.json();
    const 分组集合434 = 数据434 && 数据434.data;
    if (!分组集合434) return [];
    const 结果列表433 = [];
    for (const 分组名434 of Object.keys(分组线路映射)) {
      const 是否值6434 = 分组名434 === 'ipv6';
      if (是否值6434 && !值6已启用) continue;
      if (!是否值6434 && !值4已启用) continue;
      const 线路名434 = 分组线路映射[分组名434];
      if (线路名434 === '移动' && !值值432) continue;
      if (线路名434 === '联通' && !值值431) continue;
      if (线路名434 === '电信' && !值值430) continue;
      const 分组434 = 分组集合434[分组名434];
      const 条目列表434 = 分组434 && Array.isArray(分组434.info) ? 分组434.info : [];
      for (const 条目434 of 条目列表434) {
        const 地址434 = 规范化节点主机(条目434 && 条目434.ip);
        if (!地址434) continue;
        结果列表433.push({
          isp: 线路名434,
          ip: 地址434,
          colo: ''
        });
      }
    }
    return 结果列表433;
  } catch {}
  return [];
}

async function 处理网页套接字请求(请求417, 配置快照) {
  const { 认证令牌, 启用明文, 启用木马, 传输路径, 当前工作器地区 } = 配置快照;
  // 从 path query 读取覆盖参数
  const 请求网址 = new URL(请求417.url);
  const 请求回退416 = 请求网址.searchParams.get('p') || '';
  const 请求地区415 = (请求网址.searchParams.get('wk') || '').toUpperCase();
  const 请求值字符串 = 请求网址.searchParams.get('rm') || '';
  const 请求值414 = 请求值字符串 ? 请求值字符串.toLowerCase() !== 'no' : null;
  const 请求代理字符串 = 请求网址.searchParams.get('s') || '';
  let 请求代理配置413 = null;
  if (请求代理字符串) {
    try {
      请求代理配置413 = 解析代理配置(请求代理字符串);
    } catch {}
  }

  const 实际地区411 = 请求地区415 || 当前工作器地区;
  const 网页套接字值 = new WebSocketPair();
  const [客户端值, 值值410] = Object.values(网页套接字值);
  值值410.accept();
  值值410.binaryType = 'arraybuffer';
  let 远程连接值409 = {
    socket: null,
    writer: null,
    drainUpload: null
  };
  let 是否域名系统值 = false;
  let 协议类型 = null;
  let 值值408 = false;
  let 传输值 = false;
  const 值队列 = 创建块队列(传输上传包大小, 传输上传队列上限, 传输上传队列上限 >> 8);
  const 请求值407 = 请求417.fetcher;
  function 处理值远程写入器() {
    try {
      远程连接值409.writer?.releaseLock();
    } catch {}
    远程连接值409.writer = null;
  }
  function 关闭传输() {
    if (传输值) return;
    传输值 = true;
    值队列.clear();
    处理值远程写入器();
    try {
      远程连接值409.socket?.close();
    } catch {}
    关闭套接字值(值值410);
  }
  function 处理队列值(块404) {
    const 数据403 = 处理值值8数组(块404);
    if (!数据403.byteLength) return true;
    if (!值队列.sow(数据403)) {
      关闭传输();
      return false;
    }
    远程连接值409.drainUpload();
    return true;
  }
  async function 处理值值402() {
    if (值值408 || 传输值 || !远程连接值409.writer) return;
    值值408 = true;
    try {
      for (;;) {
        if (传输值 || !远程连接值409.writer) break;
        const 数据401 = 值队列.bundle();
        if (!数据401) break;
        await 远程连接值409.writer.write(数据401);
      }
    } catch {
      关闭传输();
    } finally {
      值值408 = false;
      if (!值队列.empty && !传输值 && 远程连接值409.writer) queueMicrotask(处理值值402);
    }
  }
  远程连接值409.drainUpload = () => {
    if (!值值408 && !值队列.empty && 远程连接值409.writer) queueMicrotask(处理值值402);
  };
  const 值数据399 = 请求417.headers.get("sec-websocket-protocol") || '';
  const 本地值398 = 制作值流(值值410, 值数据399);
  本地值398.pipeTo(new WritableStream({
    close() { 关闭传输(); },
    abort() { 关闭传输(); },
    async write(块397) {
      if (传输值) return;
      const 数据396 = 处理值值8数组(块397);
      if (是否域名系统值) return await 处理值用户数据报(数据396, 值值410, null, 请求值407);
      if (远程连接值409.socket && 远程连接值409.writer) {
        if (!处理队列值(数据396)) throw new Error('upload queue overflow');
        return;
      }
      if (协议类型) {
        if (!处理队列值(数据396)) throw new Error('upload queue overflow');
        return;
      }
      if (!协议类型) {
        if (启用明文 && 数据396.byteLength >= 24) {
          const 轻量协议结果 = 解析网页套接字值头部(数据396, 认证令牌);
          if (!轻量协议结果.hasError) {
            协议类型 = "vless";
            const {
              port: 端口394,
              hostname: 主机名393,
              rawIndex: 原始索引,
              version: 本地值392,
              isUDP: 是否用户数据报391
            } = 轻量协议结果;
            if (是否用户数据报391) {
              if (端口394 === 53) 是否域名系统值 = true;else throw new Error(错误_仅支持域名系统用户数据报);
            }
            const 值头部390 = new Uint8Array([本地值392[0], 0]);
            const 原始数据389 = 数据396.subarray(原始索引);
            if (是否域名系统值) return 处理值用户数据报(原始数据389, 值值410, 值头部390, 请求值407);
            await 连接网页套接字TCP(主机名393, 端口394, 原始数据389, 值值410, 值头部390, 远程连接值409, 请求回退416, 实际地区411, 请求值414, 请求代理配置413, 请求值407, 配置快照);
            return;
          }
        }
        if (启用木马 && 数据396.byteLength >= 56) {
          const 值结果 = await 解析木马头部(数据396, 认证令牌, 传输路径);
          if (!值结果.hasError) {
            协议类型 = "trojan";
            const {
              port: 端口387,
              hostname: 主机名386,
              rawClientData: 原始客户端数据
            } = 值结果;
            await 连接网页套接字TCP(主机名386, 端口387, 原始客户端数据, 值值410, null, 远程连接值409, 请求回退416, 实际地区411, 请求值414, 请求代理配置413, 请求值407, 配置快照);
            return;
          }
        }
        throw new Error('Invalid protocol or authentication failed');
      }
    }
  })).catch(关闭传输);
  return new Response(null, {
    status: 101,
    webSocket: 客户端值
  });
}
async function 连接网页套接字TCP(主机, 端口数字, 原始数据, 网页套接字382, 值头部381, 远程连接值, 请求回退 = '', 请求地区 = '', 请求值380 = null, 请求代理配置 = null, 请求值379 = null, 配置快照) {
  const { 回退地址, 当前工作器地区, 启用地区匹配, 已解析代理5配置, 是否代理已启用, 仅走代理, 启用代理降级 } = 配置快照;
  // 优先使用客户端path参数，其次回退到全局配置
  const 实际回退 = 请求回退 || 回退地址;
  const 实际地区 = 请求地区 || 当前工作器地区;
  const 实际地区匹配 = 请求值380 !== null ? 请求值380 : 启用地区匹配;
  const 实际代理配置 = 请求代理配置 || 已解析代理5配置;
  const 实际代理已启用 = 请求代理配置 ? true : 是否代理已启用;
  if (仅走代理 && !实际代理已启用) {
    关闭套接字值(网页套接字382);
    return;
  }
  const 值数据378 = 处理值值8数组(原始数据);
  async function 连接值发送(地址377, 端口376, 值代理 = false) {
    // 走代理时首包交给握手函数在释放写入器前发出，避免换写入器导致连接被重置
    const 远程值375 = 值代理 ? await 处理值代理连接(地址377, 端口376, 实际代理配置, 请求值379, 值数据378) : await 连接值套接字(地址377, 端口376, 请求值379, 传输连接竞速数);
    const 写入器374 = 远程值375.writable.getWriter();
    if (!值代理 && 值数据378.byteLength) await 写入器374.write(值数据378);
    return {
      remoteSock: 远程值375,
      writer: 写入器374
    };
  }
  function 处理值值当前(远程值373, 写入器372) {
    if (远程连接值.socket !== 远程值373) return;
    try {
      写入器372?.releaseLock();
    } catch {}
    远程连接值.socket = null;
    远程连接值.writer = null;
  }
  function 处理值远程(远程值370, 写入器369, 重试值368) {
    try {
      if (远程连接值.writer && 远程连接值.writer !== 写入器369) {
        远程连接值.writer.releaseLock();
      }
    } catch {}
    远程连接值.socket = 远程值370;
    远程连接值.writer = 写入器369;
    远程连接值.drainUpload?.();
    远程值370.closed.catch(() => {}).finally(() => {
      if (远程连接值.socket === 远程值370) 关闭套接字值(网页套接字382);
    });
    转发远程数据到WS(远程值370, 网页套接字382, 值头部381, 重试值368).finally(() => {
      if (远程连接值.socket === 远程值370) {
        try {
          写入器369.releaseLock();
        } catch {}
        远程连接值.writer = null;
      }
    });
  }
  async function 处理重试连接() {
    // 只走代理：不回落到直连或备用地址，避免出口 IP 泄漏。
    if (仅走代理 && 实际代理已启用) {
      关闭套接字值(网页套接字382);
      return;
    }
    let 回退走代理 = 实际代理已启用;
    if (启用代理降级 && 实际代理已启用) {
      try {
        const { remoteSock, writer } = await 连接值发送(主机, 端口数字, true);
        处理值远程(remoteSock, writer, null);
        return;
      } catch {
        回退走代理 = false;
      }
    }
    const 回退 = await 获取回退目标(实际回退, 实际地区, 实际地区匹配, 端口数字);
    try {
      const { remoteSock, writer } = await 连接值发送(回退.address, 回退.port, 回退走代理);
      处理值远程(remoteSock, writer, null);
    } catch {
      关闭套接字值(网页套接字382);
    }
  }
  try {
    // 首跳是否走代理：只走代理 → 必走；优先直连 → 不走；其余按代理是否配置
    const 首跳走代理 = 仅走代理 && 实际代理已启用 ? true : 启用代理降级 ? false : 实际代理已启用;
    const {
      remoteSock: 值套接字358,
      writer: 值写入器
    } = await 连接值发送(主机, 端口数字, 首跳走代理);
    处理值远程(值套接字358, 值写入器, () => {
      处理值值当前(值套接字358, 值写入器);
      处理重试连接();
    });
  } catch {
    await 处理重试连接();
  }
}
function 处理值值8数组(块356) {
  if (块356 instanceof Uint8Array) return 块356;
  if (块356 instanceof ArrayBuffer) return new Uint8Array(块356);
  if (ArrayBuffer.isView(块356)) return new Uint8Array(块356.buffer, 块356.byteOffset, 块356.byteLength);
  return new Uint8Array(块356);
}
function 拼接值8数组(头部355, 主体354) {
  const 头值353 = 处理值值8数组(头部355);
  const 乙值352 = 处理值值8数组(主体354);
  const 输出351 = new Uint8Array(头值353.byteLength + 乙值352.byteLength);
  输出351.set(头值353);
  输出351.set(乙值352, 头值353.byteLength);
  return 输出351;
}
function 创建块队列(本地值350, 值值349 = 本地值350, 项目列表上限 = Math.max(1, 值值349 >> 8)) {
  let 队列 = [];
  let 头部348 = 0;
  let 值字节347 = 0;
  let 值缓冲346 = null;
  function 处理本地值345() {
    if (头部348 > 32 && 头部348 * 2 >= 队列.length) {
      队列 = 队列.slice(头部348);
      头部348 = 0;
    }
  }
  function 处理本地值344() {
    if (头部348 >= 队列.length) return null;
    const 数据343 = 队列[头部348];
    队列[头部348++] = undefined;
    值字节347 -= 数据343.byteLength;
    处理本地值345();
    return 数据343;
  }
  return {
    get empty() {
      return 头部348 >= 队列.length;
    },
    clear() {
      队列 = [];
      头部348 = 0;
      值字节347 = 0;
    },
    sow(数据342) {
      const 数量值 = 数据342?.byteLength || 0;
      if (!数量值) return true;
      if (值字节347 + 数量值 > 值值349 || 队列.length - 头部348 >= 项目列表上限) return false;
      队列.push(数据342);
      值字节347 += 数量值;
      return true;
    },
    bundle() {
      const 数据341 = 处理本地值344();
      if (!数据341 || 头部348 >= 队列.length || 数据341.byteLength >= 本地值350) return 数据341;
      let 本地值340 = 数据341.byteLength;
      let 结束 = 头部348;
      while (结束 < 队列.length) {
        const 本地值339 = 队列[结束];
        const 值值338 = 本地值340 + 本地值339.byteLength;
        if (值值338 > 本地值350) break;
        本地值340 = 值值338;
        结束++;
      }
      if (结束 === 头部348) return 数据341;
      const 输出 = 值缓冲346 ||= new Uint8Array(本地值350);
      输出.set(数据341);
      let 偏移337 = 数据341.byteLength;
      while (头部348 < 结束) {
        const 本地值336 = 队列[头部348];
        队列[头部348++] = undefined;
        值字节347 -= 本地值336.byteLength;
        输出.set(本地值336, 偏移337);
        偏移337 += 本地值336.byteLength;
      }
      处理本地值345();
      return 输出.subarray(0, 本地值340);
    }
  };
}
function 创建WS下行聚合器(网页套接字335) {
  const 本地值334 = 传输下载包大小;
  const 尾部 = 传输下载尾部;
  const 值值333 = Math.max(4096, 尾部 << 3);
  let 本地值332 = new Uint8Array(本地值334);
  let 值字节 = 0;
  let 计时器 = 0;
  let 值值331 = false;
  let 本地值330 = 0;
  let 值键 = 0;
  let 值值329 = 0;
  function 刷新() {
    if (计时器) clearTimeout(计时器);
    计时器 = 0;
    值值331 = false;
    if (!值字节) return;
    if (网页套接字335.readyState === 1) 网页套接字335.send(本地值332.subarray(0, 值字节).slice());
    本地值332 = new Uint8Array(本地值334);
    值字节 = 0;
    值值329 = 0;
  }
  function 处理本地值() {
    if (计时器 || 值值331) return;
    值值331 = true;
    值键 = 本地值330;
    queueMicrotask(() => {
      值值331 = false;
      if (!值字节 || 计时器) return;
      if (本地值334 - 值字节 < 尾部) return 刷新();
      计时器 = setTimeout(() => {
        计时器 = 0;
        if (!值字节) return;
        if (本地值334 - 值字节 < 尾部) return 刷新();
        if (值值329 < 2 && (本地值330 !== 值键 || 值字节 < 值值333)) {
          值值329++;
          值键 = 本地值330;
          return 处理本地值();
        }
        刷新();
      }, Math.max(传输下载延迟, 1));
    });
  }
  return {
    send(块328) {
      const 数据327 = 处理值值8数组(块328);
      let 偏移326 = 0;
      const 本地值325 = 数据327.byteLength;
      if (!本地值325) return;
      while (偏移326 < 本地值325) {
        if (!值字节 && 本地值325 - 偏移326 >= 本地值334) {
          const 大小324 = Math.min(本地值334, 本地值325 - 偏移326);
          if (网页套接字335.readyState === 1) 网页套接字335.send(偏移326 || 大小324 !== 本地值325 ? 数据327.subarray(偏移326, 偏移326 + 大小324) : 数据327);
          偏移326 += 大小324;
          continue;
        }
        const 大小323 = Math.min(本地值334 - 值字节, 本地值325 - 偏移326);
        本地值332.set(数据327.subarray(偏移326, 偏移326 + 大小323), 值字节);
        值字节 += 大小323;
        偏移326 += 大小323;
        本地值330++;
        if (值字节 === 本地值334 || 本地值334 - 值字节 < 尾部) 刷新();else 处理本地值();
      }
    },
    flush: 刷新
  };
}
function 处理打开值套接字(地址322, 端口321, 请求值320 = null) {
  const 目标 = {
    hostname: 地址322,
    port: 端口321
  };
  if (请求值320 && typeof 请求值320.connect === 'function') return 请求值320.connect(目标);
  return 连接(目标);
}
async function 处理打开值套接字值(地址319, 端口318, 请求值317 = null) {
  try {
    const 套接字316 = 处理打开值套接字(地址319, 端口318, 请求值317);
    if (套接字316?.opened) await 套接字316.opened;
    return 套接字316;
  } catch (错误315) {
    if (!请求值317) throw 错误315;
    const 套接字314 = 连接({
      hostname: 地址319,
      port: 端口318
    });
    if (套接字314?.opened) await 套接字314.opened;
    return 套接字314;
  }
}
async function 连接值套接字(地址313, 端口312, 请求值311 = null, 竞速数量 = 1) {
  const 数量 = Math.max(1, 竞速数量 | 0);
  if (数量 <= 1) return 处理打开值套接字值(地址313, 端口312, 请求值311);
  const 本地值310 = Array.from({
    length: 数量
  }, () => 处理打开值套接字值(地址313, 端口312, 请求值311));
  const 本地值309 = await Promise.any(本地值310);
  本地值310.forEach(本地值308 => {
    本地值308.then(套接字307 => {
      if (套接字307 !== 本地值309) {
        try {
          套接字307.close();
        } catch {}
      }
    }, () => {});
  });
  return 本地值309;
}
function 获取唯一标识字节(令牌305) {
  if (唯一标识字节缓存.has(令牌305)) return 唯一标识字节缓存.get(令牌305);
  const 十六进制 = String(令牌305 || '').replace(/-/g, '');
  if (十六进制.length !== 32) return null;
  const 字节304 = new Uint8Array(16);
  for (let 索引值303 = 0; 索引值303 < 16; 索引值303++) {
    const 值302 = Number.parseInt(十六进制.slice(索引值303 * 2, 索引值303 * 2 + 2), 16);
    if (Number.isNaN(值302)) return null;
    字节304[索引值303] = 值302;
  }
  if (唯一标识字节缓存.size > 16) 唯一标识字节缓存.clear();
  唯一标识字节缓存.set(令牌305, 字节304);
  return 字节304;
}
function 处理值唯一标识(字节301, 偏移300, 令牌299) {
  const 标识298 = 获取唯一标识字节(令牌299);
  return !!标识298 && 字节301[偏移300] === 标识298[0] && 字节301[偏移300 + 1] === 标识298[1] && 字节301[偏移300 + 2] === 标识298[2] && 字节301[偏移300 + 3] === 标识298[3] && 字节301[偏移300 + 4] === 标识298[4] && 字节301[偏移300 + 5] === 标识298[5] && 字节301[偏移300 + 6] === 标识298[6] && 字节301[偏移300 + 7] === 标识298[7] && 字节301[偏移300 + 8] === 标识298[8] && 字节301[偏移300 + 9] === 标识298[9] && 字节301[偏移300 + 10] === 标识298[10] && 字节301[偏移300 + 11] === 标识298[11] && 字节301[偏移300 + 12] === 标识298[12] && 字节301[偏移300 + 13] === 标识298[13] && 字节301[偏移300 + 14] === 标识298[14] && 字节301[偏移300 + 15] === 标识298[15];
}
function 解析网页套接字值头部(块297, 令牌) {
  const 字节296 = 处理值值8数组(块297);
  if (字节296.byteLength < 24) return {
    hasError: true,
    message: 错误_无效数据
  };
  const 本地值295 = 字节296.subarray(0, 1);
  if (!处理值唯一标识(字节296, 1, 令牌)) return {
    hasError: true,
    message: 错误_无效用户
  };
  const 值长度294 = 字节296[17];
  const 命令索引 = 18 + 值长度294;
  if (字节296.byteLength < 命令索引 + 5) return {
    hasError: true,
    message: 错误_无效数据
  };
  const 命令293 = 字节296[命令索引];
  let 是否用户数据报 = false;
  if (命令293 === 1) {} else if (命令293 === 2) {
    是否用户数据报 = true;
  } else {
    return {
      hasError: true,
      message: 错误_不支持命令
    };
  }
  const 端口索引292 = 19 + 值长度294;
  const 端口291 = 字节296[端口索引292] << 8 | 字节296[端口索引292 + 1];
  let 地址索引290 = 端口索引292 + 2,
    地址长度289 = 0,
    地址值索引 = 地址索引290 + 1,
    主机名288 = '';
  const 地址类型287 = 字节296[地址索引290];
  switch (地址类型287) {
    case 地址类型_四版:
      地址长度289 = 4;
      if (字节296.byteLength < 地址值索引 + 地址长度289) return {
        hasError: true,
        message: 错误_无效数据
      };
      主机名288 = `${字节296[地址值索引]}.${字节296[地址值索引 + 1]}.${字节296[地址值索引 + 2]}.${字节296[地址值索引 + 3]}`;
      break;
    case 地址类型_网址:
      if (字节296.byteLength < 地址值索引 + 1) return {
        hasError: true,
        message: 错误_无效数据
      };
      地址长度289 = 字节296[地址值索引++];
      if (字节296.byteLength < 地址值索引 + 地址长度289) return {
        hasError: true,
        message: 错误_无效数据
      };
      主机名288 = 共享解码器.decode(字节296.subarray(地址值索引, 地址值索引 + 地址长度289));
      break;
    case 地址类型_六版:
      地址长度289 = 16;
      if (字节296.byteLength < 地址值索引 + 地址长度289) return {
        hasError: true,
        message: 错误_无效数据
      };
      const 值6286 = [];
      const 值6视图 = new DataView(字节296.buffer, 字节296.byteOffset + 地址值索引, 地址长度289);
      for (let 索引值285 = 0; 索引值285 < 8; 索引值285++) 值6286.push(值6视图.getUint16(索引值285 * 2).toString(16));
      主机名288 = 值6286.join(':');
      break;
    default:
      return {
        hasError: true,
        message: `${错误_无效地址类型}: ${地址类型287}`
      };
  }
  if (!主机名288) return {
    hasError: true,
    message: `${错误_空地址}: ${地址类型287}`
  };
  return {
    hasError: false,
    port: 端口291,
    hostname: 主机名288,
    isUDP: 是否用户数据报,
    rawIndex: 地址值索引 + 地址长度289,
    version: 本地值295
  };
}
function 制作值流(套接字284, 值数据头部) {
  let 本地值283 = false;
  return new ReadableStream({
    start(控制器282) {
      套接字284.addEventListener('message', 事件 => {
        if (!本地值283) 控制器282.enqueue(处理值值8数组(事件.data));
      });
      套接字284.addEventListener('close', () => {
        if (!本地值283) {
          关闭套接字值(套接字284);
          控制器282.close();
        }
      });
      套接字284.addEventListener('error', 错误281 => 控制器282.error(错误281));
      const {
        earlyData: 值数据,
        error: 错误280
      } = 处理基础64值数组(值数据头部);
      if (错误280) 控制器282.error(错误280);else if (值数据) 控制器282.enqueue(处理值值8数组(值数据));
    },
    cancel() {
      本地值283 = true;
      关闭套接字值(套接字284);
    }
  });
}
async function 转发远程数据到WS(远程套接字, 网页套接字278, 头部数据, 重试值) {
  let 头部277 = 头部数据,
    是否有数据 = false,
    本地值276 = false;

  // 关键：直连有时握手成功但远端长时间无数据，需要超时触发降级
  let 首次字节计时器 = null;
  if (重试值) {
    首次字节计时器 = setTimeout(() => {
      if (!是否有数据 && !本地值276) {
        本地值276 = true;
        try {
          远程套接字.close && 远程套接字.close();
        } catch {}
        重试值();
      }
    }, 首字节超时);
  }
  const 本地值274 = 创建WS下行聚合器(网页套接字278);
  let 读取器273 = null;
  let 本地值272 = true;
  let 缓冲271 = new ArrayBuffer(传输块大小);
  try {
    try {
      读取器273 = 远程套接字.readable.getReader({
        mode: 'byob'
      });
    } catch {
      本地值272 = false;
      读取器273 = 远程套接字.readable.getReader();
    }
    for (;;) {
      const 结果269 = 本地值272 ? await 读取器273.read(new Uint8Array(缓冲271, 0, 传输块大小)) : await 读取器273.read();
      if (结果269.done) break;
      const 读取值 = 结果269.value;
      let 块268 = 处理值值8数组(读取值);
      const 值缓冲 = 本地值272 && 读取值?.buffer instanceof ArrayBuffer && 读取值.buffer.byteLength >= 传输块大小 ? 读取值.buffer : new ArrayBuffer(传输块大小);
      if (!块268.byteLength) continue;
      if (!是否有数据) {
        是否有数据 = true;
        if (首次字节计时器) {
          clearTimeout(首次字节计时器);
          首次字节计时器 = null;
        }
      }
      if (网页套接字278.readyState !== 1) throw new Error(错误_网页套接字未打开);
      if (头部277) {
        块268 = 拼接值8数组(头部277, 块268);
        头部277 = null;
      }
      if (块268.byteLength >= 传输块大小 >> 1) {
        本地值274.flush();
        网页套接字278.send(块268);
        if (本地值272) 缓冲271 = new ArrayBuffer(传输块大小);
      } else {
        本地值274.send(块268.slice());
        if (本地值272) 缓冲271 = 值缓冲;
      }
    }
    本地值274.flush();
  } catch {
    // 已经触发 retry 时不要关闭 WS（retry 会重新挂载新 socket）
    if (!本地值276) 关闭套接字值(网页套接字278);
  } finally {
    try {
      本地值274.flush();
    } catch {}
    try {
      读取器273?.releaseLock();
    } catch {}
  }
  if (首次字节计时器) {
    clearTimeout(首次字节计时器);
    首次字节计时器 = null;
  }
  if (!是否有数据 && !本地值276 && 重试值) 重试值();
}
async function 处理值用户数据报(用户数据报块, 网页套接字, 值头部, 请求值 = null) {
  try {
    const 值套接字 = await 连接值套接字('8.8.4.4', 53, 请求值, 1);
    let 头部 = 值头部;
    const 写入器264 = 值套接字.writable.getWriter();
    await 写入器264.write(用户数据报块);
    写入器264.releaseLock();
    await 转发远程数据到WS(值套接字, 网页套接字, 头部, null);
  } catch {}
}
async function 处理值代理连接(地址262, 端口261, 代理配置, 请求值258 = null, 首包数据 = null) {
  // 按代理种类分派：隧道走建隧请求，其余保持套接字5 握手
  if (代理配置 && (代理配置.kind === 代理种类_隧道 || 代理配置.kind === 代理种类_安全隧道)) {
    return 处理值隧道连接(地址262, 端口261, 代理配置, 请求值258, 首包数据);
  }
  const {
    username: 本地值260,
    password: 密码259,
    hostname: 主机名258,
    socksPort: 代理端口257
  } = 代理配置;
  // 优先用请求自带的 fetcher 建连，回退到全局连接
  const 套接字256 = 处理打开值套接字(主机名258, 代理端口257, 请求值258);
  let 写入器255 = null;
  let 读取器254 = null;
  try {
    写入器255 = 套接字256.writable.getWriter();
    await 写入器255.write(new Uint8Array(本地值260 ? [5, 2, 0, 2] : [5, 1, 0]));
    读取器254 = 套接字256.readable.getReader();
    // 响应可能分片到达，按需累积到足够长度再解析；残留字节留给下一步
    let 残留字节 = new Uint8Array(0);
    async function 读满(需要长度) {
      while (残留字节.length < 需要长度) {
        const { value: 分片, done: 已结束 } = await 读取器254.read();
        if (已结束 || !分片) throw new Error(错误_代理连接失败);
        残留字节 = 拼接值8数组(残留字节, 分片);
      }
      return 残留字节;
    }
    function 取走(长度) {
      const 结果 = 残留字节.subarray(0, 长度);
      残留字节 = 残留字节.subarray(长度);
      return 结果;
    }
    let 本地值253 = await 读满(2);
    if (本地值253[0] !== 5 || 本地值253[1] === 255) throw new Error(错误_代理无可用方法);
    const 选中方法 = 本地值253[1];
    取走(2);
    if (选中方法 === 2) {
      if (!本地值260 || !密码259) throw new Error(错误_代理需要认证);
      const 编码器252 = new TextEncoder();
      const 认证请求 = new Uint8Array([1, 本地值260.length, ...编码器252.encode(本地值260), 密码259.length, ...编码器252.encode(密码259)]);
      await 写入器255.write(认证请求);
      本地值253 = await 读满(2);
      if (本地值253[0] !== 1 || 本地值253[1] !== 0) throw new Error(错误_代理认证失败);
      取走(2);
    }
    // 统一用域名型寻址，避免 VLESS / Trojan 不同的地址类型编号影响 SOCKS 握手。
    const 编码器251 = new TextEncoder();
    const 目标字节 = 编码器251.encode(规范化目标地址(地址262));
    const 本地值250 = new Uint8Array([3, 目标字节.length, ...目标字节]);
    await 写入器255.write(new Uint8Array([5, 1, 0, ...本地值250, 端口261 >> 8, 端口261 & 255]));
    // 连接应答长度随绑定地址类型而变，先读固定的 4 字节头再按类型补齐
    本地值253 = await 读满(4);
    if (本地值253[1] !== 0) throw new Error(错误_代理连接失败);
    const 绑定地址类型 = 本地值253[3];
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
    if (首包数据 && 首包数据.byteLength) await 写入器255.write(首包数据);
    写入器255.releaseLock();
    读取器254.releaseLock();
    // 应答之后若已捎带目标数据，重新挂回流首部，避免丢首包
    if (残留字节.length) return 包装残留套接字(套接字256, 残留字节);
    return 套接字256;
  } catch (代理错误) {
    try { 写入器255?.releaseLock(); } catch {}
    try { 读取器254?.releaseLock(); } catch {}
    try { 套接字256.close(); } catch {}
    throw 代理错误;
  }
}
// 六版地址在域名型寻址里不带方括号
function 规范化目标地址(地址234值) {
  const 文本 = String(地址234值 || '');
  return /^\[.*\]$/.test(文本) ? 文本.slice(1, -1) : 文本;
}
async function 处理值隧道连接(地址238值, 端口237值, 代理配置, 请求值236值 = null, 首包数据235值 = null) {
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
  const 套接字 = 请求值236值 && typeof 请求值236值.connect === 'function' ? (连接选项 === undefined ? 请求值236值.connect(目标参数) : 请求值236值.connect(目标参数, 连接选项)) : 连接(目标参数, 连接选项);
  if (套接字?.opened) await 套接字.opened;
  // IPv6 目标在请求行里要带方括号
  const 目标主机 = 地址238值.includes(':') && !/^\[.*\]$/.test(地址238值) ? `[${地址238值}]` : 地址238值;
  const 目标地址 = `${目标主机}:${端口237值}`;
  let 请求头 = `${文本_连接方法} ${目标地址}${文本_协议版本}${文本_换行}` + `${文本_主机头}${目标地址}${文本_换行}` + `${文本_用户代理头}${文本_换行}` + `${文本_代理保持}${文本_换行}`;
  if (隧道用户) {
    请求头 += `${文本_代理认证头}${btoa(`${隧道用户}:${隧道密码 || ''}`)}${文本_换行}`;
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
      缓冲 = 拼接值8数组(缓冲, 分片);
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
    if (首包数据235值 && 首包数据235值.byteLength) await 写入器.write(首包数据235值);
    写入器.releaseLock();
    读取器.releaseLock();
    if (残留数据.byteLength) return 包装残留套接字(套接字, 残留数据);
    return 套接字;
  } catch (隧道错误) {
    try {
      写入器.releaseLock();
    } catch {}
    try {
      读取器.releaseLock();
    } catch {}
    try {
      套接字.close();
    } catch {}
    throw 隧道错误;
  }
}
// 把建隧响应里捎带的目标数据重新挂回可读流首部
function 包装残留套接字(套接字, 残留数据) {
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

async function 解析木马头部(缓冲234, 本地值233, 传输路径 = '') {
  const 字节 = 处理值值8数组(缓冲234);
  const 密码值井号 = 传输路径 || 本地值233;
  const 值224密码 = await 处理值224井号(密码值井号);
  if (字节.byteLength < 56) {
    return {
      hasError: true,
      message: "invalid " + "trojan" + " data - too short"
    };
  }
  let 值值索引 = 56;
  if (字节[56] !== 0x0d || 字节[57] !== 0x0a) {
    return {
      hasError: true,
      message: "invalid " + "trojan" + " header format (missing CR LF)"
    };
  }
  const 密码232 = 共享解码器.decode(字节.subarray(0, 值值索引));
  if (密码232 !== 值224密码) {
    return {
      hasError: true,
      message: "invalid " + "trojan" + " password"
    };
  }
  const 代理5数据缓冲 = 字节.subarray(值值索引 + 2);
  if (代理5数据缓冲.byteLength < 6) {
    return {
      hasError: true,
      message: "invalid SOCKS5 request data"
    };
  }
  const 视图231 = new DataView(代理5数据缓冲.buffer, 代理5数据缓冲.byteOffset, 代理5数据缓冲.byteLength);
  const 命令230 = 视图231.getUint8(0);
  if (命令230 !== 1) {
    return {
      hasError: true,
      message: "unsupported command, only TCP (CONNECT) is allowed"
    };
  }
  const 本地值229 = 视图231.getUint8(1);
  let 地址长度 = 0;
  let 地址索引228 = 2;
  let 地址227 = "";
  switch (本地值229) {
    case 1:
      地址长度 = 4;
      地址227 = 代理5数据缓冲.subarray(地址索引228, 地址索引228 + 地址长度).join(".");
      break;
    case 3:
      地址长度 = 代理5数据缓冲[地址索引228];
      地址索引228 += 1;
      地址227 = 共享解码器.decode(代理5数据缓冲.subarray(地址索引228, 地址索引228 + 地址长度));
      break;
    case 4:
      地址长度 = 16;
      const 数据视图 = new DataView(代理5数据缓冲.buffer, 代理5数据缓冲.byteOffset + 地址索引228, 地址长度);
      const 值6 = [];
      for (let 索引值226 = 0; 索引值226 < 8; 索引值226++) {
        值6.push(数据视图.getUint16(索引值226 * 2).toString(16));
      }
      地址227 = 值6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invalid addressType is ${本地值229}`
      };
  }
  if (!地址227) {
    return {
      hasError: true,
      message: `address is empty, addressType is ${本地值229}`
    };
  }
  const 端口索引225 = 地址索引228 + 地址长度;
  const 端口远程 = new DataView(代理5数据缓冲.buffer, 代理5数据缓冲.byteOffset + 端口索引225, 2).getUint16(0);
  return {
    hasError: false,
    port: 端口远程,
    hostname: 地址227,
    rawClientData: 代理5数据缓冲.subarray(端口索引225 + 4)
  };
}
async function 处理值224井号(文本224) {
  const 编码器 = new TextEncoder();
  const 数据223 = 编码器.encode(文本224);
  const 本地值222 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let 头部游标 = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
  const 消息长度 = 数据223.length;
  const 值长度221 = 消息长度 * 8;
  const 值长度220 = Math.ceil((消息长度 + 9) / 64) * 64;
  const 本地值219 = new Uint8Array(值长度220);
  本地值219.set(数据223);
  本地值219[消息长度] = 0x80;
  const 视图 = new DataView(本地值219.buffer);
  视图.setUint32(值长度220 - 4, 值长度221, false);
  for (let 块218 = 0; 块218 < 值长度220; 块218 += 64) {
    const 写入器包装 = new Uint32Array(64);
    for (let 索引值217 = 0; 索引值217 < 16; 索引值217++) {
      写入器包装[索引值217] = 视图.getUint32(块218 + 索引值217 * 4, false);
    }
    for (let 索引值216 = 16; 索引值216 < 64; 索引值216++) {
      const 值0215 = 处理值值200(写入器包装[索引值216 - 15], 7) ^ 处理值值200(写入器包装[索引值216 - 15], 18) ^ 写入器包装[索引值216 - 15] >>> 3;
      const 值1214 = 处理值值200(写入器包装[索引值216 - 2], 17) ^ 处理值值200(写入器包装[索引值216 - 2], 19) ^ 写入器包装[索引值216 - 2] >>> 10;
      写入器包装[索引值216] = 写入器包装[索引值216 - 16] + 值0215 + 写入器包装[索引值216 - 7] + 值1214 >>> 0;
    }
    let [甲值213, 乙值, 丙值212, 丁值211, 事件值210, 表单值, 本地值209, 头值208] = 头部游标;
    for (let 索引值207 = 0; 索引值207 < 64; 索引值207++) {
      const 值1206 = 处理值值200(事件值210, 6) ^ 处理值值200(事件值210, 11) ^ 处理值值200(事件值210, 25);
      const 本地值205 = 事件值210 & 表单值 ^ ~事件值210 & 本地值209;
      const 值1 = 头值208 + 值1206 + 本地值205 + 本地值222[索引值207] + 写入器包装[索引值207] >>> 0;
      const 值0 = 处理值值200(甲值213, 2) ^ 处理值值200(甲值213, 13) ^ 处理值值200(甲值213, 22);
      const 本地值204 = 甲值213 & 乙值 ^ 甲值213 & 丙值212 ^ 乙值 & 丙值212;
      const 值2203 = 值0 + 本地值204 >>> 0;
      头值208 = 本地值209;
      本地值209 = 表单值;
      表单值 = 事件值210;
      事件值210 = 丁值211 + 值1 >>> 0;
      丁值211 = 丙值212;
      丙值212 = 乙值;
      乙值 = 甲值213;
      甲值213 = 值1 + 值2203 >>> 0;
    }
    头部游标[0] = 头部游标[0] + 甲值213 >>> 0;
    头部游标[1] = 头部游标[1] + 乙值 >>> 0;
    头部游标[2] = 头部游标[2] + 丙值212 >>> 0;
    头部游标[3] = 头部游标[3] + 丁值211 >>> 0;
    头部游标[4] = 头部游标[4] + 事件值210 >>> 0;
    头部游标[5] = 头部游标[5] + 表单值 >>> 0;
    头部游标[6] = 头部游标[6] + 本地值209 >>> 0;
    头部游标[7] = 头部游标[7] + 头值208 >>> 0;
  }
  const 结果202 = [];
  for (let 索引值201 = 0; 索引值201 < 7; 索引值201++) {
    结果202.push((头部游标[索引值201] >>> 24 & 0xff).toString(16).padStart(2, '0'), (头部游标[索引值201] >>> 16 & 0xff).toString(16).padStart(2, '0'), (头部游标[索引值201] >>> 8 & 0xff).toString(16).padStart(2, '0'), (头部游标[索引值201] & 0xff).toString(16).padStart(2, '0'));
  }
  return 结果202.join('');
}
function 处理值值200(值199, 本地值198) {
  return 值199 >>> 本地值198 | 值199 << 32 - 本地值198;
}
let 值值197 = 0;
const 值超文本缓冲大小 = 128 * 1024;
const 连接超时值 = 5000;

const 上限值 = 32;

function 验证唯一标识扩展超文本(标识192, 唯一标识191) {
  for (let 索引190 = 0; 索引190 < 16; 索引190++) {
    if (标识192[索引190] !== 唯一标识191[索引190]) {
      return false;
    }
  }
  return true;
}

function 解析唯一标识扩展超文本(唯一标识184) {
  唯一标识184 = 唯一标识184.replaceAll('-', '');
  const 结果值183 = [];
  for (let 索引182 = 0; 索引182 < 16; 索引182++) {
    const 取值181 = parseInt(唯一标识184.substr(索引182 * 2, 2), 16);
    结果值183.push(取值181);
  }
  return 结果值183;
}
function 获取扩展超文本缓冲(大小) {
  return new Uint8Array(new ArrayBuffer(大小 || 值超文本缓冲大小));
}
async function 读取扩展超文本头部(本地值180, 唯一标识字符串) {
  const 读取器179 = 本地值180.getReader({
    mode: 'byob'
  });
  let 已超时 = false;
  const 超时标识 = setTimeout(() => {
    已超时 = true;
    读取器179.cancel().catch(() => {});
  }, 连接超时值);
  try {
    let 结果值178 = await 读取器179.readAtLeast(1 + 16 + 1, 获取扩展超文本缓冲());
    if (!结果值178.value || 结果值178.value.length < 1 + 16 + 1) {
      throw new Error('header too short');
    }
    let 本地值177 = 0;
    let 索引 = 0;
    let 缓存 = 结果值178.value;
    本地值177 += 结果值178.value.length;
    const 本地值176 = 缓存[0];
    const 标识175 = 缓存.slice(1, 1 + 16);
    const 唯一标识174 = 解析唯一标识扩展超文本(唯一标识字符串);
    if (!验证唯一标识扩展超文本(标识175, 唯一标识174)) {
      throw new Error(`invalid UUID`);
    }
    const 值长度173 = 缓存[1 + 16];
    const 地址值1 = 1 + 16 + 1 + 值长度173 + 1 + 2 + 1;
    if (地址值1 + 1 > 本地值177) {
      if (结果值178.done) {
        throw new Error(`header too short`);
      }
      索引 = 地址值1 + 1 - 本地值177;
      结果值178 = await 读取器179.readAtLeast(索引, 获取扩展超文本缓冲());
      if (!结果值178.value || 结果值178.value.length < 索引) {
        throw new Error('header too short');
      }
      本地值177 += 结果值178.value.length;
      缓存 = 拼接值8数组(缓存, 结果值178.value);
    }
    const 命令 = 缓存[1 + 16 + 1 + 值长度173];
    if (命令 !== 1) {
      throw new Error(`unsupported command: ${命令}`);
    }
    const 端口172 = (缓存[地址值1 - 1 - 2] << 8) + 缓存[地址值1 - 1 - 1];
    const 本地值171 = 缓存[地址值1 - 1];
    let 头部长度 = -1;
    if (本地值171 === 地址类型_四版) {
      头部长度 = 地址值1 + 4;
    } else if (本地值171 === 地址类型_六版) {
      头部长度 = 地址值1 + 16;
    } else if (本地值171 === 地址类型_网址) {
      头部长度 = 地址值1 + 1 + 缓存[地址值1];
    }
    if (头部长度 < 0) {
      throw new Error('read address type failed');
    }
    索引 = 头部长度 - 本地值177;
    if (索引 > 0) {
      if (结果值178.done) {
        throw new Error(`read address failed`);
      }
      结果值178 = await 读取器179.readAtLeast(索引, 获取扩展超文本缓冲());
      if (!结果值178.value || 结果值178.value.length < 索引) {
        throw new Error('read address failed');
      }
      本地值177 += 结果值178.value.length;
      缓存 = 拼接值8数组(缓存, 结果值178.value);
    }
    let 主机名170 = '';
    索引 = 地址值1;
    switch (本地值171) {
      case 地址类型_四版:
        主机名170 = 缓存.slice(索引, 索引 + 4).join('.');
        break;
      case 地址类型_网址:
        主机名170 = new TextDecoder().decode(缓存.slice(索引 + 1, 索引 + 1 + 缓存[索引]));
        break;
      case 地址类型_六版:
        主机名170 = 缓存.slice(索引, 索引 + 16).reduce((字符串值, 值2169, 值2, 甲值) => 值2 % 2 ? 字符串值.concat(((甲值[值2 - 1] << 8) + 值2169).toString(16)) : 字符串值, []).join(':');
        break;
    }
    if (主机名170.length < 1) {
      throw new Error('failed to parse hostname');
    }
    const 数据 = 缓存.slice(头部长度);
    return {
      hostname: 主机名170,
      port: 端口172,
      data: 数据,
      resp: new Uint8Array([本地值176, 0]),
      reader: 读取器179,
      done: 结果值178.done
    };
  } catch (错误168) {
    try { await 读取器179.cancel(); } catch {}
    try {
      读取器179.releaseLock();
    } catch {}
    if (已超时) throw new DOMException('XHTTP header timeout', 'TimeoutError');
    throw 错误168;
  } finally {
    clearTimeout(超时标识);
  }
}

// XHTTP 沿用 WS 的出站策略；其回退由建连失败触发，WS 另有首字节超时重试。
async function 连接值远程扩展超文本(首包, 请求值扩展 = null, 配置快照) {
  const { 回退地址, 当前工作器地区, 启用地区匹配, 已解析代理5配置, 是否代理已启用, 仅走代理, 启用代理降级 } = 配置快照;
  if (仅走代理 && !是否代理已启用) return null;
  const { hostname: 主机, port: 端口 } = 首包;
  const 建连 = async (地址, 端口值, 走代理) => 走代理
    ? 处理值代理连接(地址, 端口值, 已解析代理5配置, 请求值扩展, null)
    : 连接值套接字(地址, 端口值, 请求值扩展, 传输连接竞速数);
  const 首跳走代理 = 是否代理已启用 && (仅走代理 || !启用代理降级);
  try {
    return createXHTTPRelay(首包, await 建连(主机, 端口, 首跳走代理));
  } catch {
    if (仅走代理 && 是否代理已启用) return null;
  }
  let 回退走代理 = 是否代理已启用;
  if (启用代理降级 && 是否代理已启用) {
    try {
      return createXHTTPRelay(首包, await 建连(主机, 端口, true));
    } catch {
      回退走代理 = false;
    }
  }
  try {
    const 回退 = await 获取回退目标(回退地址, 当前工作器地区, 启用地区匹配, 端口);
    return createXHTTPRelay(首包, await 建连(回退.address, 回退.port, 回退走代理));
  } catch {
    return null;
  }
}
async function 处理扩展超文本客户端(主体128, 唯一标识, 请求值扩展 = null, 配置快照) {
  if (值值197 >= 上限值) {
    return new Response('Too many connections', {
      status: 429
    });
  }
  值值197++;
  let 本地值127 = false;
  const 本地值126 = () => {
    if (!本地值127) {
      值值197 = Math.max(0, 值值197 - 1);
      本地值127 = true;
    }
  };
  let 首包;
  let 已交付连接 = false;
  try {
    首包 = await 读取扩展超文本头部(主体128, 唯一标识);
    const 远程连接 = await 连接值远程扩展超文本(首包, 请求值扩展, 配置快照);
    if (远程连接 === null) {
      return null;
    }
    const 连接值 = 远程连接.closed.finally(本地值126);
    已交付连接 = true;
    return {
      readable: 远程连接.readable,
      closed: 连接值
    };
  } catch (错误120) {
    if (错误120.name === 'TimeoutError') return new Response('XHTTP header timeout', { status: 408 });
    return null;
  } finally {
    if (!已交付连接) {
      本地值126();
      if (首包?.reader) {
        try { await 首包.reader.cancel(); } catch {}
        try { 首包.reader.releaseLock(); } catch {}
      }
    }
  }
}
async function 处理扩展超文本值(请求119, 配置快照) {

  try {
    return await 处理扩展超文本客户端(请求119.body, 配置快照.认证令牌, 请求119.fetcher, 配置快照);
  } catch {
    return null;
  }
}
function 处理基础64值数组(值64字符串) {
  if (!值64字符串) return {
    error: null
  };
  try {
    值64字符串 = 值64字符串.replace(/-/g, '+').replace(/_/g, '/');
    return {
      earlyData: Uint8Array.from(atob(值64字符串), 丙值117 => 丙值117.charCodeAt(0)).buffer,
      error: null
    };
  } catch (错误116) {
    return {
      error: 错误116
    };
  }
}
function 关闭套接字值(套接字) {
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
    const 控制器 = new AbortController();
    const 超时标识 = setTimeout(() => 控制器.abort(), 超时);
    try {
      const 响应 = await fetch(网址, {
        signal: 控制器.signal
      });
      if (!响应.ok) return;
      let 文本 = '';
      try {
        const 缓冲 = await 响应.arrayBuffer();
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
          文本 = await 响应.text();
        }
        if (!文本 || 文本.trim().length === 0) {
          return;
        }
      } catch {
        return;
      }
      const 行列表 = 文本.trim().split('\n').map(行值14 => 行值14.trim()).filter(行值 => 行值);
      const 是否值 = 行列表.length > 1 && 行列表[0].includes(',');
      const 六版地址模式 = /^[^\[\]]*:[^\[\]]*:[^\[\]]/;
      if (!是否值) {
        行列表.forEach(行13 => {
          const 井号索引 = 行13.indexOf('#');
          const [主机部分, 备注] = 井号索引 > -1 ? [行13.substring(0, 井号索引), 行13.substring(井号索引)] : [行13, ''];
          const { address, port } = 解析地址值端口(主机部分);
          const host = address.includes(':') ? `[${address}]` : address;
          const 端口12 = new URL(网址).searchParams.get('port') || 默认端口;
          结果列表.add(`${host}:${port || 端口12}${备注}`);
        });
      } else {
        const 头部列表 = 行列表[0].split(',').map(头值11 => 头值11.trim());
        const 数据行列表 = 行列表.slice(1);
        if (头部列表.includes('IP地址') && 头部列表.includes('端口') && 头部列表.includes('数据中心')) {
          const 地址索引10 = 头部列表.indexOf('IP地址'),
            端口索引 = 头部列表.indexOf('端口');
          const 备注索引 = 头部列表.indexOf('国家') > -1 ? 头部列表.indexOf('国家') : 头部列表.indexOf('城市') > -1 ? 头部列表.indexOf('城市') : 头部列表.indexOf('数据中心');
          const 传输层安全索引 = 头部列表.indexOf('TLS');
          数据行列表.forEach(行9 => {
            const 列列表8 = 行9.split(',').map(丙值7 => 丙值7.trim());
            if (传输层安全索引 !== -1 && 列列表8[传输层安全索引]?.toLowerCase() !== 'true') return;
            const 包裹地址6 = 六版地址模式.test(列列表8[地址索引10]) ? `[${列列表8[地址索引10]}]` : 列列表8[地址索引10];
            结果列表.add(`${包裹地址6}:${列列表8[端口索引]}#${列列表8[备注索引]}`);
          });
        } else if (头部列表.some(头值5 => 头值5.includes('IP')) && 头部列表.some(头值4 => 头值4.includes('延迟')) && 头部列表.some(头值3 => 头值3.includes('下载速度'))) {
          const 地址索引 = 头部列表.findIndex(头值2 => 头值2.includes('IP'));
          const 延迟索引 = 头部列表.findIndex(头值1 => 头值1.includes('延迟'));
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
    finally { clearTimeout(超时标识); }
  }));
  return Array.from(结果列表);
}
