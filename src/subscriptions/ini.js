import { decodeBase64Text as 解码64 } from '../encoding.js';
import { parseShareLink as 解析值链接 } from './links.js';
import { SubscriptionCompatibilityError } from './errors.js';

function compatibleIniNodes(links, client, trojanOnly = false) {
  const nodes = links.map(解析值链接).filter(node => node &&
    (node.proto === 'trojan' && node.tls || !trojanOnly && node.proto === 'vless'));
  if (!nodes.length) {
    throw new SubscriptionCompatibilityError(trojanOnly
      ? '当前 Surge 格式没有兼容的节点，请启用 TLS Trojan WebSocket（et=yes），或使用 V2Ray/base64、Clash、Sing-box 格式。'
      : `当前 ${client} 格式没有兼容的节点，请启用 VLESS WebSocket 或 TLS Trojan WebSocket。`);
  }
  // These INI serializers use comma-separated fields and one node per line.
  // Reject passwords they cannot safely represent instead of changing a secret.
  if (nodes.some(node => node.proto === 'trojan' && /[,\r\n]/.test(node.password))) {
    throw new SubscriptionCompatibilityError(`当前 ${client} 格式无法表示包含逗号或换行的 Trojan 密码，请使用 V2Ray/base64、Clash 或 Sing-box 格式。`);
  }
  return nodes;
}

function 处理值值列表(名称列表610, 本地值609 = {}) {
  const {
    directFirst: 直连首次 = false,
    extraGroups: 值值608 = [],
    compact: 本地值607 = false
  } = 本地值609;
  const 本地值606 = 本地值607 ? ',' : ', ';
  const 列表605 = 名称列表610.length ? 名称列表610.join(本地值606) : 'DIRECT';
  const 部分列表604 = [];
  if (直连首次) 部分列表604.push('🎯 全球直连', '🚀 节点选择');else 部分列表604.push('🚀 节点选择', '🎯 全球直连');
  部分列表604.push(...值值608);
  if (名称列表610.length) 部分列表604.push(列表605);
  return 部分列表604.join(本地值606);
}

const 值基础 = 解码64('aHR0cHM6Ly9mYXN0bHkuanNkZWxpdnIubmV0L2doL0FDTDRTU1IvQUNMNFNTUkBtYXN0ZXIvQ2xhc2g=');
const 值规则 = 名称563 => `${值基础}/${名称563}.list`;

export function generateSurge(链接列表561, { dns } = {}) {
  const 节点列表560 = compatibleIniNodes(链接列表561, 'Surge', true);
  const 域名系统值558 = dns || '223.5.5.5';
  const 名称列表557 = 节点列表560.map(数量值556 => 数量值556.name);
  const 行列表555 = ['[General]', 'loglevel = notify', 'internet-test-url = http://www.apple.com/library/test/success.html', 解码64('cHJveHktdGVzdC11cmwgPSBodHRwOi8vd3d3LmdzdGF0aWMuY29tL2dlbmVyYXRlXzIwNA=='), 'test-timeout = 3', `dns-server = ${域名系统值558.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}, 119.29.29.29, system`, 'encrypted-dns-server = https://223.5.5.5/dns-query, https://1.12.12.12/dns-query', 'ipv6 = true', 'allow-wifi-access = false', 'wifi-access-http-port = 6152', 解码64('d2lmaS1hY2Nlc3Mtc29ja3M1LXBvcnQgPSA2MTUz'), 解码64('c2tpcC1wcm94eSA9IDEyNy4wLjAuMSwgMTkyLjE2OC4wLjAvMTYsIDEwLjAuMC4wLzgsIDE3Mi4xNi4wLjAvMTIsIGxvY2FsaG9zdCwgKi5sb2NhbCwgY2FwdGl2ZS5hcHBsZS5jb20='), 'exclude-simple-hostnames = true', 'show-error-page-for-reject = true', '', 解码64('W1Byb3h5XQ==')];
  for (const 数量值554 of 节点列表560) {
    const 服务名称指示 = 数量值554.sni;
    行列表555.push(`${数量值554.name} = ${解码64('dHJvamFu')}, ${数量值554.server}, ${数量值554.port}, password=${数量值554.password}, sni=${服务名称指示}, ws=true, ws-path=${数量值554.path}, ws-headers=Host:${数量值554.host}, skip-cert-verify=false, tfo=true`);
  }
  行列表555.push('');
  行列表555.push(解码64('W1Byb3h5IEdyb3VwXQ=='));
  const 列表553 = 名称列表557.length ? 名称列表557.join(', ') : 'DIRECT';
  行列表555.push(`🚀 节点选择 = select, 🎯 全球直连, ${列表553}`);
  行列表555.push(`🌍 国外媒体 = select, ${处理值值列表(名称列表557)}`);
  行列表555.push(`📺 哔哩哔哩 = select, ${处理值值列表(名称列表557, {
    directFirst: true
  })}`);
  行列表555.push(`📹 油管视频 = select, ${处理值值列表(名称列表557, {
    extraGroups: ['🌍 国外媒体']
  })}`);
  行列表555.push(`🎬 奈飞视频 = select, ${处理值值列表(名称列表557, {
    extraGroups: ['🌍 国外媒体']
  })}`);
  行列表555.push(`📲 电报信息 = select, ${处理值值列表(名称列表557)}`);
  行列表555.push(`🌐 谷歌服务 = select, ${处理值值列表(名称列表557)}`);
  行列表555.push(`🤖 OpenAI = select, ${处理值值列表(名称列表557)}`);
  行列表555.push(`Ⓜ️ 微软服务 = select, ${处理值值列表(名称列表557, {
    directFirst: true
  })}`);
  行列表555.push(`🍎 苹果服务 = select, ${处理值值列表(名称列表557, {
    directFirst: true
  })}`);
  行列表555.push(`🎯 全球直连 = select, DIRECT`);
  行列表555.push(`🛑 全球拦截 = select, REJECT, DIRECT`);
  行列表555.push(`🐟 漏网之鱼 = select, ${处理值值列表(名称列表557)}`);
  行列表555.push('');
  行列表555.push('[Rule]');
  行列表555.push(`RULE-SET,${值规则('LocalAreaNetwork')},🎯 全球直连`);
  行列表555.push(`RULE-SET,${值规则('UnBan')},🎯 全球直连`);
  行列表555.push(`RULE-SET,${值规则('BanAD')},🛑 全球拦截`);
  行列表555.push(`RULE-SET,${值规则('BanProgramAD')},🛑 全球拦截`);
  行列表555.push(`RULE-SET,${值规则('GoogleFCM')},🌐 谷歌服务`);
  行列表555.push(`RULE-SET,${值规则('GoogleCN')},🎯 全球直连`);
  行列表555.push(`RULE-SET,${值规则('SteamCN')},🎯 全球直连`);
  行列表555.push(`RULE-SET,${值规则('Microsoft')},Ⓜ️ 微软服务`);
  行列表555.push(`RULE-SET,${值规则('Apple')},🍎 苹果服务`);
  行列表555.push(`RULE-SET,${值规则('Telegram')},📲 电报信息`);
  行列表555.push(`RULE-SET,${值规则('OpenAi')},🤖 OpenAI`);
  行列表555.push(`RULE-SET,${值规则('Claude')},🤖 OpenAI`);
  行列表555.push(`RULE-SET,${值规则('Copilot')},🤖 OpenAI`);
  行列表555.push(`RULE-SET,${值规则('Netflix')},🌍 国外媒体`);
  行列表555.push(`RULE-SET,${值规则('YouTube')},🌍 国外媒体`);
  行列表555.push(`RULE-SET,${值规则('Disney')},🌍 国外媒体`);
  行列表555.push(`RULE-SET,${值规则('Spotify')},🌍 国外媒体`);
  行列表555.push(`RULE-SET,${值规则('TikTok')},🌍 国外媒体`);
  行列表555.push(`RULE-SET,${值规则('BiliBili')},📺 哔哩哔哩`);
  行列表555.push(`RULE-SET,${值规则(解码64('UHJveHlNZWRpYQ=='))},🌍 国外媒体`);
  行列表555.push(`RULE-SET,${值规则(解码64('UHJveHlHRldsaXN0'))},🚀 节点选择`);
  行列表555.push(`RULE-SET,${值规则('ChinaDomain')},🎯 全球直连`);
  行列表555.push(`RULE-SET,${值规则('ChinaCompanyIp')},🎯 全球直连`);
  行列表555.push(`RULE-SET,${值规则('ChinaIp')},🎯 全球直连`);
  行列表555.push('GEOIP,CN,🎯 全球直连');
  行列表555.push('FINAL,🐟 漏网之鱼,dns-failed');
  return 行列表555.join('\n');
}

export function generateLoon(链接列表551, { dns } = {}) {
  const 节点列表550 = compatibleIniNodes(链接列表551, 'Loon');
  const 名称列表548 = 节点列表550.map(数量值547 => 数量值547.name);
  const 行列表546 = ['[General]', 'ip-mode = dual', `dns-server = ${(dns || '223.5.5.5').replace(/^https?:\/\//, '').replace(/\/.*$/, '')},119.29.29.29,system`, 'doh-server = https://223.5.5.5/dns-query, https://1.12.12.12/dns-query', 解码64('YWxsb3ctdWRwLXByb3h5ID0gdHJ1ZQ=='), 'allow-wifi-access = false', 'sni-sniffing = true', 解码64('c2tpcC1wcm94eSA9IDEyNy4wLjAuMSwxOTIuMTY4LjAuMC8xNiwxMC4wLjAuMC84LDE3Mi4xNi4wLjAvMTIsbG9jYWxob3N0LCoubG9jYWwsY2FwdGl2ZS5hcHBsZS5jb20='), 'bypass-tun = 10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.0.0.0/24,192.0.2.0/24,192.88.99.0/24,192.168.0.0/16,198.51.100.0/24,203.0.113.0/24,224.0.0.0/4,255.255.255.255/32', '', 解码64('W1Byb3h5XQ==')];
  for (const 数量值545 of 节点列表550) {
    if (数量值545.proto === 解码64('dmxlc3M=')) {
      const 部分列表544 = [`${数量值545.server}`, `${数量值545.port}`, `udp=true`, `username=${数量值545.uuid}`, `transport=ws`, `path=${数量值545.path}`, `host=${数量值545.host}`, `over-tls=${数量值545.tls ? 'true' : 'false'}`];
      if (数量值545.tls) {
        部分列表544.push(`tls-name=${数量值545.sni}`);
        if (数量值545.alpn && 数量值545.alpn.length) 部分列表544.push(`alpn=${数量值545.alpn.join(':')}`);
        部分列表544.push(`skip-cert-verify=false`);
      }
      行列表546.push(`${数量值545.name} = ${解码64('dmxlc3M=')},${部分列表544.join(',')}`);
    } else {
      const 部分列表543 = [`${数量值545.server}`, `${数量值545.port}`, `password=${数量值545.password}`, `transport=ws`, `path=${数量值545.path}`, `host=${数量值545.host}`, `over-tls=true`, `tls-name=${数量值545.sni}`];
      if (数量值545.alpn && 数量值545.alpn.length) 部分列表543.push(`alpn=${数量值545.alpn.join(':')}`);
      部分列表543.push(`skip-cert-verify=false`);
      行列表546.push(`${数量值545.name} = ${解码64('dHJvamFu')},${部分列表543.join(',')}`);
    }
  }
  行列表546.push('');
  行列表546.push(解码64('W1Byb3h5IEdyb3VwXQ=='));
  const 列表542 = 名称列表548.length ? 名称列表548.join(',') : 'DIRECT';
  行列表546.push(`🚀 节点选择 = select,🎯 全球直连,${列表542}`);
  行列表546.push(`🌍 国外媒体 = select,${处理值值列表(名称列表548, {
    compact: true
  })}`);
  行列表546.push(`📺 哔哩哔哩 = select,${处理值值列表(名称列表548, {
    directFirst: true,
    compact: true
  })}`);
  行列表546.push(`📹 油管视频 = select,${处理值值列表(名称列表548, {
    extraGroups: ['🌍 国外媒体'],
    compact: true
  })}`);
  行列表546.push(`🎬 奈飞视频 = select,${处理值值列表(名称列表548, {
    extraGroups: ['🌍 国外媒体'],
    compact: true
  })}`);
  行列表546.push(`📲 电报信息 = select,${处理值值列表(名称列表548, {
    compact: true
  })}`);
  行列表546.push(`🌐 谷歌服务 = select,${处理值值列表(名称列表548, {
    compact: true
  })}`);
  行列表546.push(`🤖 OpenAI = select,${处理值值列表(名称列表548, {
    compact: true
  })}`);
  行列表546.push(`Ⓜ️ 微软服务 = select,${处理值值列表(名称列表548, {
    directFirst: true,
    compact: true
  })}`);
  行列表546.push(`🍎 苹果服务 = select,${处理值值列表(名称列表548, {
    directFirst: true,
    compact: true
  })}`);
  行列表546.push(`🎯 全球直连 = select,DIRECT`);
  行列表546.push(`🛑 全球拦截 = select,REJECT,DIRECT`);
  行列表546.push(`🐟 漏网之鱼 = select,${处理值值列表(名称列表548, {
    compact: true
  })}`);
  行列表546.push('');
  行列表546.push('[Remote Rule]');
  行列表546.push(`${值规则('LocalAreaNetwork')}, policy=🎯 全球直连, tag=局域网, enabled=true`);
  行列表546.push(`${值规则('BanAD')}, policy=🛑 全球拦截, tag=广告拦截, enabled=true`);
  行列表546.push(`${值规则('BanProgramAD')}, policy=🛑 全球拦截, tag=应用广告, enabled=true`);
  行列表546.push(`${值规则('GoogleCN')}, policy=🎯 全球直连, tag=GoogleCN, enabled=true`);
  行列表546.push(`${值规则('SteamCN')}, policy=🎯 全球直连, tag=SteamCN, enabled=true`);
  行列表546.push(`${值规则('Microsoft')}, policy=Ⓜ️ 微软服务, tag=微软, enabled=true`);
  行列表546.push(`${值规则('Apple')}, policy=🍎 苹果服务, tag=苹果, enabled=true`);
  行列表546.push(`${值规则('Telegram')}, policy=📲 电报信息, tag=电报, enabled=true`);
  行列表546.push(`${值规则('OpenAi')}, policy=🤖 OpenAI, tag=OpenAI, enabled=true`);
  行列表546.push(`${值规则('Netflix')}, policy=🌍 国外媒体, tag=Netflix, enabled=true`);
  行列表546.push(`${值规则('YouTube')}, policy=🌍 国外媒体, tag=YouTube, enabled=true`);
  行列表546.push(`${值规则('Disney')}, policy=🌍 国外媒体, tag=Disney, enabled=true`);
  行列表546.push(`${值规则('Spotify')}, policy=🌍 国外媒体, tag=Spotify, enabled=true`);
  行列表546.push(`${值规则('TikTok')}, policy=🌍 国外媒体, tag=TikTok, enabled=true`);
  行列表546.push(`${值规则('BiliBili')}, policy=📺 哔哩哔哩, tag=哔哩哔哩, enabled=true`);
  行列表546.push(`${值规则(解码64('UHJveHlNZWRpYQ=='))}, policy=🌍 国外媒体, tag=${解码64('5Luj55CG5aqS5L2T')}, enabled=true`);
  行列表546.push(`${值规则(解码64('UHJveHlHRldsaXN0'))}, policy=🚀 节点选择, tag=${解码64('5Luj55CG5YiX6KGo')}, enabled=true`);
  行列表546.push(`${值规则('ChinaDomain')}, policy=🎯 全球直连, tag=中国域名, enabled=true`);
  行列表546.push(`${值规则('ChinaIp')}, policy=🎯 全球直连, tag=中国IP, enabled=true`);
  行列表546.push('');
  行列表546.push('[Rule]');
  行列表546.push('GEOIP,CN,🎯 全球直连');
  行列表546.push('FINAL,🐟 漏网之鱼');
  return 行列表546.join('\n');
}

export function generateQuantumultX(链接列表541, { dns } = {}) {
  const 节点列表 = compatibleIniNodes(链接列表541, 'Quantumult X');
  const 名称列表 = 节点列表.map(数量值539 => 数量值539.name);
  const 圈叉基础配置 = 解码64('aHR0cHM6Ly9mYXN0bHkuanNkZWxpdnIubmV0L2doL2JsYWNrbWF0cml4Ny9pb3NfcnVsZV9zY3JpcHRAbWFzdGVyL3J1bGUvUXVhbnR1bXVsdFg=');
  const 行列表538 = ['[general]', 'network_check_url=http://www.gstatic.com/generate_204', 'server_check_url=http://www.gstatic.com/generate_204', 'profile_img_url=https://fastly.jsdelivr.net/gh/byJoey/cfnew@main/snippets/logo.png', 'dns_exclusion_list=*.cmpassport.com, *.jegotrip.com.cn, *.icloud.com, *.icloud.com.cn, *.apple.com, *.weibo.com, *.qq.com', 'running_mode_trigger=filter', '', '[dns]', `server=${(dns || '223.5.5.5').replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`, 'server=119.29.29.29', 'server=https://223.5.5.5/dns-query', 'server=https://1.12.12.12/dns-query', '', '[server_local]'];
  for (const 数量值537 of 节点列表) {
    if (数量值537.proto === 解码64('dmxlc3M=')) {
      const 部分列表536 = [`${数量值537.server}:${数量值537.port}`, `method=none`, `password=${数量值537.uuid}`, `obfs=${数量值537.tls ? 'wss' : 'ws'}`, `obfs-host=${数量值537.host}`, `obfs-uri=${数量值537.path}`];
      if (数量值537.tls) 部分列表536.push(`tls-verification=true`, `tls13=true`);
      部分列表536.push(`tag=${数量值537.name}`);
      行列表538.push(`${解码64('dmxlc3M=')}=${部分列表536.join(', ')}`);
    } else {
      const 部分列表535 = [`${数量值537.server}:${数量值537.port}`, `password=${数量值537.password}`, `over-tls=true`, `tls-host=${数量值537.sni}`, `obfs=wss`, `obfs-host=${数量值537.host}`, `obfs-uri=${数量值537.path}`, `tls-verification=true`, `tag=${数量值537.name}`];
      行列表538.push(`${解码64('dHJvamFu')}=${部分列表535.join(', ')}`);
    }
  }
  行列表538.push('');
  行列表538.push('[policy]');
  const 列表534 = 名称列表.length ? 名称列表.join(', ') : 'direct';
  行列表538.push(`static=🚀 节点选择, ${列表534}, direct, img-url=${解码64('aHR0cHM6Ly9mYXN0bHkuanNkZWxpdnIubmV0L2doL0tvb2xzb24vUXVyZUBtYXN0ZXIvSWNvblNldC9Db2xvci9Qcm94eS5wbmc=')}`);
  行列表538.push(`static=🌍 国外媒体, ${处理值值列表(名称列表)}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/ForeignMedia.png`);
  行列表538.push(`static=📺 哔哩哔哩, ${处理值值列表(名称列表, {
    directFirst: true
  })}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/bilibili.png`);
  行列表538.push(`static=📹 油管视频, ${处理值值列表(名称列表, {
    extraGroups: ['🌍 国外媒体']
  })}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/YouTube.png`);
  行列表538.push(`static=🎬 奈飞视频, ${处理值值列表(名称列表, {
    extraGroups: ['🌍 国外媒体']
  })}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Netflix.png`);
  行列表538.push(`static=📲 电报信息, ${处理值值列表(名称列表)}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Telegram.png`);
  行列表538.push(`static=🌐 谷歌服务, ${处理值值列表(名称列表)}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Google.png`);
  行列表538.push(`static=🤖 OpenAI, ${处理值值列表(名称列表)}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/ChatGPT.png`);
  行列表538.push(`static=Ⓜ️ 微软服务, ${处理值值列表(名称列表, {
    directFirst: true
  })}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Microsoft.png`);
  行列表538.push(`static=🍎 苹果服务, ${处理值值列表(名称列表, {
    directFirst: true
  })}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Apple.png`);
  行列表538.push(`static=🎯 全球直连, direct, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Direct.png`);
  行列表538.push(`static=🛑 全球拦截, reject, direct, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Advertising.png`);
  行列表538.push(`static=🐟 漏网之鱼, ${处理值值列表(名称列表)}, img-url=https://fastly.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Final.png`);
  行列表538.push('');
  行列表538.push('[filter_remote]');
  行列表538.push(`${圈叉基础配置}/Lan/Lan.list, tag=局域网, force-policy=🎯 全球直连, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Advertising/Advertising.list, tag=广告拦截, force-policy=🛑 全球拦截, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Microsoft/Microsoft.list, tag=微软, force-policy=Ⓜ️ 微软服务, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Apple/Apple.list, tag=苹果, force-policy=🍎 苹果服务, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Telegram/Telegram.list, tag=电报, force-policy=📲 电报信息, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Google/Google.list, tag=谷歌, force-policy=🌐 谷歌服务, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/OpenAI/OpenAI.list, tag=OpenAI, force-policy=🤖 OpenAI, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Claude/Claude.list, tag=Claude, force-policy=🤖 OpenAI, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/YouTube/YouTube.list, tag=YouTube, force-policy=🌍 国外媒体, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Netflix/Netflix.list, tag=Netflix, force-policy=🌍 国外媒体, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Disney/Disney.list, tag=Disney, force-policy=🌍 国外媒体, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Spotify/Spotify.list, tag=Spotify, force-policy=🌍 国外媒体, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/TikTok/TikTok.list, tag=TikTok, force-policy=🌍 国外媒体, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/BiliBili/BiliBili.list, tag=哔哩哔哩, force-policy=📺 哔哩哔哩, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/Global/Global.list, tag=全球加速, force-policy=🚀 节点选择, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push(`${圈叉基础配置}/ChinaMax/ChinaMax.list, tag=中国直连, force-policy=🎯 全球直连, update-interval=86400, opt-parser=false, enabled=true`);
  行列表538.push('');
  行列表538.push('[filter_local]');
  行列表538.push('geoip, cn, 🎯 全球直连');
  行列表538.push('final, 🐟 漏网之鱼');
  return 行列表538.join('\n');
}
