import { fetchBytes } from '../http.js';
import { decodeBase64Text as 解码64 } from '../encoding.js';
import { SubscriptionCompatibilityError } from './errors.js';
import { parseShareLink as 解析值链接, quoteYaml } from './links.js';
import { renderClashNode, isClashCompatibleNode } from './clash.js';
import { residentialByteLimit, residentialNodeLimit } from '../limits.js';

const 家宽节点源 = 解码64('aHR0cHM6Ly93d3cudnBuZ2F0ZS5uZXQvYXBpL2lwaG9uZS8=');
const 家宽节点类型 = 解码64('b3BlbnZwbg==');
const 家宽前置字段 = 解码64('ZGlhbGVyLXByb3h5');
const 家宽机房前缀 = 解码64('cHVibGljLXZwbg==');
const 家宽机房网段 = '219.100.37.';
const 家宽缓存期限 = 30 * 60 * 1000;
const 家宽请求超时 = 10 * 1000;
let 家宽缓存 = null;
let 家宽缓存时间 = 0;
let 家宽加载中 = null;
const 家宽指令正则 = {};

function 取家宽指令(配置文本, 指令名) {
  if (!家宽指令正则[指令名]) 家宽指令正则[指令名] = new RegExp('^[ \\t]*' + 指令名 + '[ \\t]+(.+?)[ \\t]*$', 'm');
  const 命中 = 配置文本.match(家宽指令正则[指令名]);
  return 命中 ? 命中[1].trim() : '';
}

function 取家宽内联块(配置文本, 标签) {
  const 命中 = 配置文本.match(new RegExp('<' + 标签 + '>([\\s\\S]*?)<\\/' + 标签 + '>'));
  return 命中 ? 命中[1].trim() : '';
}

function 缩进证书文本(文本, 空白) {
  return 文本.split('\n').map(行 => 行.trim()).filter(行 => 行).map(行 => 空白 + 行).join('\n');
}

// 每条配置解出来约 10KB，但要的几行指令都在前 4KB 里，证书从 4.7KB 往后才开始。
// 所以只解开头一段，全量 60 多个节点的解析开销能压一半多；开头没找到 remote 再整条解。
const 家宽前段长度 = 6000;
function 解家宽配置(配置64, 整条 = false) {
  const 干净 = 配置64.replace(/\s/g, '');
  if (整条 || 干净.length <= 家宽前段长度) return 解码64(干净);
  return 解码64(干净.slice(0, 家宽前段长度));
}

// 清单里 Operator/Message 两列可能自带逗号，所以只从行首按下标取前几列，
// 配置固定是最后一列，多出来的逗号不会把解析冲歪。
function 解析家宽清单(原文) {
  const 候选 = [];
  for (const 原始行 of 原文.split('\n')) {
    const 行 = 原始行.trim();
    if (!行 || 行.charAt(0) === '*' || 行.charAt(0) === '#') continue;
    const 字段 = 行.split(',');
    if (字段.length < 15) continue;
    // 只要住宅宽带：官方自己架的机房服务器剔掉，而且那批容易满员握手失败
    if ((字段[0] || '').indexOf(家宽机房前缀) === 0) continue;
    if ((字段[1] || '').indexOf(家宽机房网段) === 0) continue;
    const 配置64 = 字段[字段.length - 1];
    if (!配置64 || 配置64.length < 100) continue;
    候选.push({ 国家: (字段[6] || '').toUpperCase() || 'XX', 速度: parseInt(字段[4], 10) || 0, 配置64 });
  }
  // 按速度倒序。试过挑会话数最少的，结果更差（6/12 对 2/12）：
  // 会话少多半是这台根本连不上，不是空闲，别按会话数挑。
  候选.sort((甲, 乙) => 乙.速度 - 甲.速度);
  const 节点列表 = [];
  let 证书 = null;
  for (const 项 of 候选) {
    if (节点列表.length >= residentialNodeLimit) break;
    let 配置文本 = '';
    try {
      配置文本 = 解家宽配置(项.配置64);
      if (!取家宽指令(配置文本, 'remote')) 配置文本 = 解家宽配置(项.配置64, true);
    } catch (错误) {
      continue;
    }
    // 前置只能承载 TCP，UDP 的节点丢掉
    if ((取家宽指令(配置文本, 'proto') || 'tcp').toLowerCase() !== 'tcp') continue;
    const 远端 = 取家宽指令(配置文本, 'remote').split(/\s+/);
    if (!远端[0]) continue;
    if (!证书) {
      // 证书全站共用一份，找第一个完整的就够了
      try {
        const 全文 = 解家宽配置(项.配置64, true);
        const 本次证书 = { ca: 取家宽内联块(全文, 'ca'), cert: 取家宽内联块(全文, 'cert'), key: 取家宽内联块(全文, 'key') };
        if (本次证书.ca && 本次证书.cert && 本次证书.key) 证书 = 本次证书;
      } catch (错误) {}
      if (!证书) continue;
    }
    节点列表.push({
      国家: 项.国家,
      地址: 远端[0],
      端口: parseInt(远端[1], 10) || 443,
      加密: 取家宽指令(配置文本, 'cipher') || 'AES-128-CBC',
      摘要: 取家宽指令(配置文本, 'auth') || 'SHA1'
    });
  }
  return { 节点列表, 证书 };
}

async function 获取家宽节点() {
  if (家宽缓存 && Date.now() - 家宽缓存时间 < 家宽缓存期限) return 家宽缓存;
  if (!家宽加载中) {
    家宽加载中 = 加载家宽节点().then(结果 => {
      家宽缓存 = 结果;
      家宽缓存时间 = Date.now();
      return 结果;
    }).finally(() => { 家宽加载中 = null; });
  }
  return 家宽加载中;
}

async function 加载家宽节点() {
  // 节点源的 TLS 很老（没有 TLS1.3，ECDHE 只有 CBC 套件），有的运行环境握不上，
  // 握不上就退回明文再拉一次。清单本身是公开数据。
  let 原文 = '';
  let 最后错误 = null;
  for (const 源 of [家宽节点源, 家宽节点源.replace(/^https:/, 'http:')]) {
    try {
      const { response: 响应, bytes } = await fetchBytes(源, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/plain' },
        cf: { cacheTtl: 1800, cacheEverything: true }
      }, { timeout: 家宽请求超时, maxBytes: residentialByteLimit });
      if (!响应.ok) {
        最后错误 = new Error('节点源返回 ' + 响应.status);
        continue;
      }
      原文 = new TextDecoder().decode(bytes);
      break;
    } catch (错误) {
      最后错误 = 错误.name === 'TimeoutError' ? new Error('家宽节点源请求超时') : 错误;
    }
  }
  if (!原文) throw 最后错误 || new Error('节点源没有返回内容');
  const 结果 = 解析家宽清单(原文);
  if (!结果.节点列表.length || !结果.证书) throw new Error('没解析出能用的节点');
  return 结果;
}

// 拉不到节点直接抛错，由调用方回 503，客户端会继续用上一份，不会被空配置覆盖
export async function generateResidential(链接列表, { dns, echDomain } = {}) {
  const 前置组名 = '\u26a1 CF前置';
  const 家宽自动 = '\ud83c\udfe0 家宽自动';
  const 家宽手选 = '\ud83c\udfe0 家宽节点';
  const 节点选择 = '\ud83d\ude80 节点选择';
  const 全部前置 = 链接列表.map(解析值链接).filter(isClashCompatibleNode);
  if (!全部前置.length) {
    throw new SubscriptionCompatibilityError('当前 Clash 家宽格式没有兼容的前置节点，请启用 VLESS WebSocket 或 TLS Trojan WebSocket。');
  }
  // 落地隧道的握手特征很明显，前置用明文会被一眼认出来，有 TLS 节点就只用 TLS 的
  const 加密前置 = 全部前置.filter(项 => 项.tls);
  const 前置节点 = 加密前置.length ? 加密前置 : 全部前置;
  const 前置名称 = 前置节点.map(项 => 项.name);
  const 域名系统 = dns || 'https://223.5.5.5/dns-query';
  const { 节点列表, 证书 } = await 获取家宽节点();
  const 国家计数 = {};
  const 家宽项 = 节点列表.map(节点 => {
    国家计数[节点.国家] = (国家计数[节点.国家] || 0) + 1;
    return { ...节点, 名称: '\ud83c\udfe0 ' + 节点.国家 + '-家宽-' + String(国家计数[节点.国家]).padStart(2, '0') };
  });
  const 头部 = [
    '# cfnew 家宽订阅：CF 节点带路，落地是住宅宽带',
    '# 内核要 1.19.25 以上，老内核不认这类节点',
    '# 节点是网友共享的，掉线很正常，家宽自动会自己往下换',
    'mixed-port: 7890',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'ipv6: false',
    'unified-delay: true',
    'tcp-concurrent: true',
    'external-controller: 127.0.0.1:9090',
    'dns:',
    '  enable: true',
    '  ipv6: false',
    '  enhanced-mode: fake-ip',
    '  fake-ip-range: 198.18.0.1/16',
    '  nameserver:',
    '    - ' + 域名系统,
    '    - https://1.1.1.1/dns-query',
    ''
  ];
  const 节点段 = ['proxies:'];
  for (const 项 of 前置节点) 节点段.push(renderClashNode(项, echDomain));
  家宽项.forEach((节点, 下标) => {
    const 行 = [
      '  - name: "' + 节点.名称 + '"',
      '    type: ' + 家宽节点类型,
      '    server: ' + 节点.地址,
      '    port: ' + 节点.端口,
      '    proto: tcp',
      '    username: vpn',
      '    password: vpn',
      '    cipher: ' + 节点.加密,
      '    auth: ' + 节点.摘要,
      '    udp: false',
      '    handshake-timeout: 30',
      '    remote-dns-resolve: true',
      '    dns: [ 8.8.8.8, 1.1.1.1 ]'
    ];
    // 已确保存在兼容前置，落地始终经由此组连接。
    行.push('    ' + 家宽前置字段 + ': "' + 前置组名 + '"');
    // 证书全站同一份，第一个节点定锚点，后面引用，全量几十个节点能省下几百 KB
    if (下标 === 0) {
      行.push('    ca: &jkca |-', 缩进证书文本(证书.ca, '      '));
      行.push('    cert: &jkcert |-', 缩进证书文本(证书.cert, '      '));
      行.push('    key: &jkkey |-', 缩进证书文本(证书.key, '      '));
    } else {
      行.push('    ca: *jkca', '    cert: *jkcert', '    key: *jkkey');
    }
    节点段.push(行.join('\n'));
  });
  const 列出 = 名称列表 => 名称列表.map(名称 => '      - ' + quoteYaml(名称)).join('\n');
  // 自动组按速度排，决定回落顺序；手选组按国家排，翻起来好找
  const 按速度 = 家宽项.map(项 => 项.名称);
  const 按国家 = 家宽项.slice().sort((甲, 乙) => 甲.国家 === 乙.国家 ? 0 : (甲.国家 < 乙.国家 ? -1 : 1)).map(项 => 项.名称);
  const 分组段 = [解码64('cHJveHktZ3JvdXBzOg==')];
  if (前置名称.length) {
    分组段.push('  - name: "' + 前置组名 + '"', '    type: url-test',
      '    url: https://www.gstatic.com/generate_204', '    interval: 300', '    tolerance: 50',
      '    proxies:', 列出(前置名称));
  }
  // 全量几十个节点，测一轮就是几十次握手，所以间隔拉长、用到才测
  分组段.push('  - name: "' + 家宽自动 + '"', '    type: fallback',
    '    url: https://www.gstatic.com/generate_204', '    interval: 1800', '    lazy: true',
    '    proxies:', 列出(按速度));
  分组段.push('  - name: "' + 家宽手选 + '"', '    type: select', '    proxies:', 列出(按国家));
  const 主选列表 = ['      - "' + 家宽自动 + '"', '      - "' + 家宽手选 + '"'];
  if (前置名称.length) 主选列表.push('      - "' + 前置组名 + '"');
  主选列表.push('      - DIRECT');
  分组段.push('  - name: "' + 节点选择 + '"', '    type: select', '    proxies:', 主选列表.join('\n'));
  const 规则段 = [
    'rules:',
    '  - GEOIP,LAN,DIRECT,no-resolve',
    '  - GEOIP,CN,DIRECT,no-resolve',
    '  - MATCH,' + 节点选择
  ];
  return 头部.concat(节点段, [''], 分组段, [''], 规则段, ['']).join('\n');
}
