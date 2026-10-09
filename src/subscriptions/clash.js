import { decodeBase64Text as 解码64 } from '../encoding.js';
import { quoteYaml, normalizeHost, parseShareLink } from './links.js';
import { SubscriptionCompatibilityError } from './errors.js';

// Mihomo's Trojan transport always enables TLS; only VLESS can use plain WS.
export function isClashCompatibleNode(node) {
  return node && (node.proto === 'vless' || node.proto === 'trojan' && node.tls);
}

export function renderClashNode(数量值596, echDomain) {
  const 行列表595 = [];
  const 本地值594 = normalizeHost(数量值596.server);
  const 主机593 = normalizeHost(数量值596.host) || 本地值594;
  const 服务名称指示592 = normalizeHost(数量值596.sni) || 主机593;
  行列表595.push(`  - name: ${quoteYaml(数量值596.name)}`);
  行列表595.push(`    type: ${数量值596.proto}`);
  行列表595.push(`    server: ${quoteYaml(本地值594)}`);
  行列表595.push(`    port: ${数量值596.port}`);
  if (数量值596.proto === 解码64('dmxlc3M=')) {
    行列表595.push(`    uuid: ${数量值596.uuid}`);
    行列表595.push(`    udp: true`);
    行列表595.push(`    tls: ${数量值596.tls ? 'true' : 'false'}`);
    if (数量值596.flow) 行列表595.push(`    flow: ${quoteYaml(数量值596.flow)}`);
    行列表595.push(`    client-fingerprint: ${quoteYaml(数量值596.fp || 'chrome')}`);
  } else if (数量值596.proto === 解码64('dHJvamFu')) {
    行列表595.push(`    password: ${quoteYaml(数量值596.password)}`);
    行列表595.push(`    udp: true`);
    行列表595.push(`    client-fingerprint: ${quoteYaml(数量值596.fp || 'chrome')}`);
  }
  if (数量值596.tls) {
    行列表595.push(`    servername: ${quoteYaml(服务名称指示592)}`);
    if (数量值596.alpn && 数量值596.alpn.length) {
      行列表595.push(`    alpn: [${数量值596.alpn.map(甲值591 => quoteYaml(甲值591)).join(', ')}]`);
    }
    行列表595.push(`    skip-cert-verify: false`);
  }
  if (数量值596.network === 'ws' || 数量值596.network === 'xhttp') {
    行列表595.push(`    network: ws`);
    行列表595.push(`    ws-opts:`);
    行列表595.push(`      path: ${quoteYaml(数量值596.path)}`);
    行列表595.push(`      headers:`);
    行列表595.push(`        Host: ${quoteYaml(主机593)}`);
  } else if (数量值596.network === 'grpc') {
    行列表595.push(`    network: grpc`);
    行列表595.push(`    grpc-opts:`);
    行列表595.push(`      grpc-service-name: ${quoteYaml(数量值596.path)}`);
  }
  if (数量值596.ech) {
    const 加密客户端问候域名590 = echDomain || 'cloudflare-ech.com';
    行列表595.push(`    ech-opts:`);
    行列表595.push(`      enable: true`);
    行列表595.push(`      query-server-name: ${quoteYaml(加密客户端问候域名590)}`);
  }
  return 行列表595.join('\n');
}

export function generateClash(链接列表588, { dns = 'https://223.5.5.5/dns-query', echDomain = 'cloudflare-ech.com' } = {}) {
  const 节点列表586 = 链接列表588.map(parseShareLink).filter(isClashCompatibleNode);
  if (!节点列表586.length) {
    throw new SubscriptionCompatibilityError('当前 Clash 格式没有兼容的节点，请启用 VLESS WebSocket 或 TLS Trojan WebSocket。');
  }
  const 名称列表584 = 节点列表586.map(数量值583 => 数量值583.name);
  const 域名系统值582 = dns || 'https://223.5.5.5/dns-query';
  const 头部581 = [
    'mixed-port: 7890',
    'allow-lan: true',
    'mode: rule',
    'log-level: info',
    'ipv6: true',
    'external-controller: 127.0.0.1:9090',
    'unified-delay: true',
    'tcp-concurrent: true',
    'geodata-mode: true',
    'geo-auto-update: true',
    'geo-update-interval: 24',
    'geox-url:',
    '  geoip: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat"',
    '  geosite: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat"',
    '  mmdb: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb"',
    '  asn: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb"',
    'sniffer:',
    '  enable: true',
    '  force-dns-mapping: true',
    '  parse-pure-ip: true',
    '  sniff:',
    '    HTTP:',
    '      ports: [80, 8080-8880]',
    '      override-destination: true',
    '    TLS:',
    '      ports: [443, 8443]',
    '    QUIC:',
    '      ports: [443, 8443]',
    'dns:',
    '  enable: true',
    '  listen: 0.0.0.0:1053',
    '  ipv6: true',
    '  enhanced-mode: fake-ip',
    '  fake-ip-range: 198.18.0.1/16',
    '  fake-ip-filter:',
    '    - "*.lan"',
    '    - "+.local"',
    '    - "+.market.xiaomi.com"',
    '    - "+.msftconnecttest.com"',
    '    - "+.msftncsi.com"',
    '    - "localhost.ptlogin2.qq.com"',
    '    - "+.srv.nintendo.net"',
    '    - "+.stun.playstation.net"',
    '    - "+.xboxlive.com"',
    '  default-nameserver:',
    '    - 223.5.5.5',
    '    - 119.29.29.29',
    // 节点域名独立解析，避免境外节点 IP 触发网站 fallback 并阻塞建连。
    '  proxy-server-nameserver:',
    '    - https://223.5.5.5/dns-query',
    '    - https://119.29.29.29/dns-query',
    // DIRECT 独立解析，避免可直连的境外站点依赖网站 fallback。
    '  direct-nameserver:',
    '    - https://223.5.5.5/dns-query',
    '    - https://119.29.29.29/dns-query',
    '  direct-nameserver-follow-policy: false',
    '  nameserver-policy:',
    '    "+.hdslb.com":',
    '      - https://223.5.5.5/dns-query',
    '      - https://119.29.29.29/dns-query',
    '  nameserver:',
    `    - ${quoteYaml(域名系统值582)}`,
    '    - https://119.29.29.29/dns-query',
    '  fallback:',
    '    - https://1.1.1.1/dns-query',
    '    - https://8.8.8.8/dns-query',
    '  fallback-filter:',
    '    geoip: true',
    '    geoip-code: CN',
    '    ipcidr:',
    '      - 240.0.0.0/4',
    ''
  ];
  const 值值580 = ['proxies:'];
  for (const 数量值579 of 节点列表586) 值值580.push(renderClashNode(数量值579, echDomain));
  const 选择列表 = {
    nodes: [...名称列表584, '🎯 全球直连'],
    proxy: ['🚀 节点选择', '🎯 全球直连', ...名称列表584],
    direct: ['🎯 全球直连', '🚀 节点选择', ...名称列表584],
    media: ['🚀 节点选择', '🎯 全球直连', '🌍 国外媒体', ...名称列表584]
  };
  const 已输出列表 = new Set();
  const 组定义 = [
    ['🚀 节点选择', 'nodes'], ['🌍 国外媒体', 'proxy'],
    ['📺 哔哩哔哩', 'direct'], ['📹 油管视频', 'media'],
    ['🎬 奈飞视频', 'media'], ['📲 电报信息', 'proxy'],
    ['🌐 谷歌服务', 'proxy'], ['🤖 OpenAI', 'proxy'],
    ['Ⓜ️ 微软服务', 'direct'], ['🍎 苹果服务', 'direct'],
    ['🎯 全球直连', ['DIRECT']], ['🛑 全球拦截', ['REJECT', 'DIRECT']],
    ['🍃 应用净化', ['REJECT', 'DIRECT']], ['🐟 漏网之鱼', 'proxy']
  ];
  // YAML 列表锚点保留各组全部选项及节点顺序，无需 include-all 等客户端扩展。
  const 值值577 = ['proxy-groups:'];
  for (const [名称, 选项] of 组定义) {
    值值577.push(`  - name: ${quoteYaml(名称)}`, '    type: select');
    if (Array.isArray(选项)) {
      值值577.push('    proxies:', ...选项.map(项 => `      - ${quoteYaml(项)}`));
    } else if (已输出列表.has(选项)) {
      值值577.push(`    proxies: *${选项}Choices`);
    } else {
      已输出列表.add(选项);
      值值577.push(`    proxies: &${选项}Choices`, ...选择列表[选项].map(项 => `      - ${quoteYaml(项)}`));
    }
  }
  值值577.push('');

  // 规则源 - CDN: jsDelivr
  const 值基础576 = 解码64('aHR0cHM6Ly9mYXN0bHkuanNkZWxpdnIubmV0L2doL0xveWFsc29sZGllci9jbGFzaC1ydWxlc0ByZWxlYXNl');
  const 提供器 = (名称575, 本地值574) => [`  ${名称575}:`, `    type: http`, `    behavior: ${本地值574}`, `    url: "${值基础576}/${名称575}.txt"`, `    path: ./rulesets/loyalsoldier/${名称575}.txt`, `    interval: 86400`].join('\n');
  const 规则值 = ['rule-providers:', 提供器('reject', 'domain'), 提供器('icloud', 'domain'), 提供器('apple', 'domain'), 提供器('google', 'domain'), 提供器(解码64('cHJveHk='), 'domain'), 提供器('direct', 'domain'), 提供器('private', 'domain'), 提供器('gfw', 'domain'), 提供器('greatfire', 'domain'), 提供器('tld-not-cn', 'domain'), 提供器('telegramcidr', 'ipcidr'), 提供器('cncidr', 'ipcidr'), 提供器('lancidr', 'ipcidr'), 提供器('applications', 'classical'), ''];
  const 规则列表 = ['rules:', '  - DOMAIN-SUFFIX,acl4.ssr,🎯 全球直连', '  - DOMAIN-SUFFIX,local,🎯 全球直连', 解码64('ICAtIERPTUFJTixjbGFzaC5yYXpvcmQudG9wLPCfjq8g5YWo55CD55u06L+e'), '  - DOMAIN,yacd.haishan.me,🎯 全球直连', '  - DOMAIN,yacd.metacubex.one,🎯 全球直连', '  - DOMAIN,d.metacubex.one,🎯 全球直连', '  - DOMAIN-SUFFIX,googleapis.cn,🌐 谷歌服务', '  - DOMAIN-SUFFIX,gstatic.com,🌐 谷歌服务', '  - DOMAIN-SUFFIX,xn--ngstr-lra8j.com,🌐 谷歌服务', '  - DOMAIN-SUFFIX,googlevideo.com,📹 油管视频', '  - DOMAIN-SUFFIX,googleusercontent.com,🌐 谷歌服务', '  - DOMAIN-KEYWORD,youtube,📹 油管视频', '  - DOMAIN-SUFFIX,youtube.com,📹 油管视频', '  - DOMAIN-SUFFIX,youtu.be,📹 油管视频', '  - DOMAIN-KEYWORD,netflix,🎬 奈飞视频', '  - DOMAIN-SUFFIX,nflxext.com,🎬 奈飞视频', '  - DOMAIN-SUFFIX,nflxso.net,🎬 奈飞视频', '  - DOMAIN-SUFFIX,nflxvideo.net,🎬 奈飞视频', '  - DOMAIN-SUFFIX,nflximg.com,🎬 奈飞视频', '  - DOMAIN-SUFFIX,nflximg.net,🎬 奈飞视频', '  - DOMAIN-SUFFIX,netflix.com,🎬 奈飞视频', '  - DOMAIN-SUFFIX,netflix.net,🎬 奈飞视频', '  - DOMAIN-SUFFIX,bilibili.com,📺 哔哩哔哩', '  - DOMAIN-SUFFIX,bilivideo.com,📺 哔哩哔哩', '  - DOMAIN-SUFFIX,hdslb.com,📺 哔哩哔哩', '  - DOMAIN-KEYWORD,openai,🤖 OpenAI', '  - DOMAIN-KEYWORD,chatgpt,🤖 OpenAI', '  - DOMAIN-SUFFIX,openai.com,🤖 OpenAI', '  - DOMAIN-SUFFIX,chatgpt.com,🤖 OpenAI', '  - DOMAIN-SUFFIX,oaistatic.com,🤖 OpenAI', '  - DOMAIN-SUFFIX,oaiusercontent.com,🤖 OpenAI', '  - DOMAIN-SUFFIX,anthropic.com,🤖 OpenAI', '  - DOMAIN-SUFFIX,claude.ai,🤖 OpenAI', '  - DOMAIN-SUFFIX,perplexity.ai,🤖 OpenAI', '  - DOMAIN-SUFFIX,gemini.google.com,🤖 OpenAI', '  - RULE-SET,applications,🎯 全球直连', '  - RULE-SET,private,🎯 全球直连', '  - RULE-SET,reject,🛑 全球拦截', '  - RULE-SET,icloud,🍎 苹果服务', '  - RULE-SET,apple,🍎 苹果服务', '  - RULE-SET,google,🌐 谷歌服务', 解码64('ICAtIFJVTEUtU0VULHByb3h5LPCfmoAg6IqC54K56YCJ5oup'), '  - RULE-SET,gfw,🚀 节点选择', '  - RULE-SET,greatfire,🚀 节点选择', '  - RULE-SET,tld-not-cn,🚀 节点选择', '  - RULE-SET,direct,🎯 全球直连', '  - RULE-SET,lancidr,🎯 全球直连,no-resolve', '  - RULE-SET,cncidr,🎯 全球直连,no-resolve', '  - RULE-SET,telegramcidr,📲 电报信息,no-resolve', '  - GEOIP,LAN,🎯 全球直连,no-resolve', '  - GEOIP,CN,🎯 全球直连,no-resolve', '  - MATCH,🐟 漏网之鱼'];
  return [头部581.join('\n'), 值值580.join('\n'), '', 值值577.join('\n'), 规则值.join('\n'), 规则列表.join('\n'), ''].join('\n');
}
