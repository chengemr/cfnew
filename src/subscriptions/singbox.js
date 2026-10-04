import { decodeBase64Text as 解码64 } from '../encoding.js';
import { normalizeHost as 规范化值主机, parseShareLink as 解析值链接 } from './links.js';
import { parseAddress } from '../preferred.js';

function 拆域名系统地址(地址) {
  const 文本 = String(地址 || '').trim();
  try {
    const 网址 = new URL(文本);
    const 协议 = 网址.protocol.replace(':', '').toLowerCase();
    const 类型 = { https: 'https', http3: 'https', h3: 'https', tls: 'tls',
      quic: 'quic', udp: 'udp', dns: 'udp' }[协议];
    if (typeof 类型 === 'string') {
      const 输出 = { type: 类型, server: 规范化值主机(网址.hostname) };
      if (网址.port) 输出.server_port = Number(网址.port);
      if (类型 === 'https') {
        const 路径 = 网址.pathname + 网址.search;
        if (路径 && 路径 !== '/' && 路径 !== '/dns-query') 输出.path = 路径;
      }
      return 输出;
    }
  } catch (错误) {}
  const { address, port } = parseAddress(文本.replace(/^[a-z0-9]+:\/\//i, '').split('/')[0]);
  return { type: 'udp', server: 规范化值主机(address) || '223.5.5.5',
    ...(port ? { server_port: port } : {}) };
}

export function generateSingBox(链接列表573, { dns } = {}) {
  const 节点列表572 = 链接列表573.map(解析值链接).filter(数量值571 => 数量值571 && (数量值571.proto === 解码64('dmxlc3M=') || 数量值571.proto === 解码64('dHJvamFu')));
  const 域名系统值570 = dns || 'https://223.5.5.5/dns-query';
  const 出站值 = 节点列表572.map(数量值569 => 数量值569.name);
  function 处理节点值出站(数量值568) {
    const 输出567 = {
      type: 数量值568.proto,
      tag: 数量值568.name,
      server: 规范化值主机(数量值568.server),
      server_port: 数量值568.port
    };
    if (数量值568.proto === 解码64('dmxlc3M=')) {
      输出567.uuid = 数量值568.uuid;
      if (数量值568.flow) 输出567.flow = 数量值568.flow;
    } else {
      输出567.password = 数量值568.password;
    }
    if (数量值568.tls) {
      输出567.tls = {
        enabled: true,
        server_name: 数量值568.sni,
        insecure: false,
        utls: {
          enabled: true,
          fingerprint: 数量值568.fp || 'chrome'
        }
      };
      if (数量值568.alpn && 数量值568.alpn.length) 输出567.tls.alpn = 数量值568.alpn;
      if (数量值568.ech) {
        输出567.tls.ech = {
          enabled: true,
          pq_signature_schemes_enabled: false,
          dynamic_record_sizing_disabled: false
        };
      }
    }
    if (数量值568.network === 'ws' || 数量值568.network === 'xhttp') {
      输出567.transport = {
        type: 'ws',
        path: 数量值568.path,
        headers: {
          Host: 数量值568.host
        },
        max_early_data: 2048,
        early_data_header_name: 'Sec-WebSocket-Protocol'
      };
    } else if (数量值568.network === 'grpc') {
      输出567.transport = {
        type: 'grpc',
        service_name: 数量值568.path
      };
    }
    return 输出567;
  }

  // 远端 SRS 文件（CDN：jsDelivr 镜像）
  const 值基础值 = 'https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite';
  const 值基础地址 = 'https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip';
  const 值规则566 = 本地值565 => ({
    tag: `geosite-${本地值565}`,
    type: 'remote',
    format: 'binary',
    url: `${值基础值}/${本地值565}.srs`,
    download_detour: 'direct'
  });
  const 地址规则 = 本地值564 => ({
    tag: `geoip-${本地值564}`,
    type: 'remote',
    format: 'binary',
    url: `${值基础地址}/${本地值564}.srs`,
    download_detour: 'direct'
  });
  const 配置 = {
    log: {
      level: 'info',
      timestamp: true
    },
    dns: {
      // 新版内核 1.12 起 DNS 服务器改成按 type 写，旧的 address 字符串写法 1.14 已经删掉了
      servers: [{
        ...拆域名系统地址(域名系统值570),
        tag: 'remote',
        detour: 'select'
      }, {
        type: 'udp',
        tag: 'local',
        server: '223.5.5.5',
        detour: 'direct'
      }, {
        type: 'fakeip',
        tag: 'fakeip',
        inet4_range: '198.18.0.0/15',
        inet6_range: 'fc00::/18'
      }],
      // 拦广告不再靠 rcode://success 的假服务器，直接用 action: reject
      rules: [{
        rule_set: 'geosite-category-ads-all',
        action: 'reject'
      }, {
        rule_set: 'geosite-cn',
        server: 'local'
      }, {
        query_type: ['A', 'AAAA'],
        server: 'fakeip'
      }],
      strategy: 'ipv4_only'
    },
    inbounds: [{
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: 2080
    }, {
      type: 'tun',
      tag: 'tun-in',
      interface_name: 解码64('c2luZy1ib3g='),
      address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
      mtu: 9000,
      auto_route: true,
      strict_route: true,
      stack: 'mixed'
    }],
    outbounds: [{
      type: 'selector',
      tag: 'select',
      outbounds: ['direct', ...出站值],
      default: 出站值[0] || 'direct'
    }, {
      type: 'selector',
      tag: '🌍 国外媒体',
      outbounds: ['select', 'direct', ...出站值]
    }, {
      type: 'selector',
      tag: '📲 电报信息',
      outbounds: ['select', 'direct', ...出站值]
    }, {
      type: 'selector',
      tag: '🌐 谷歌服务',
      outbounds: ['select', 'direct', ...出站值]
    }, {
      type: 'selector',
      tag: '🤖 OpenAI',
      outbounds: ['select', 'direct', ...出站值]
    }, {
      type: 'selector',
      tag: 'Ⓜ️ 微软服务',
      outbounds: ['direct', 'select', ...出站值]
    }, {
      type: 'selector',
      tag: '🍎 苹果服务',
      outbounds: ['direct', 'select', ...出站值]
    }, {
      type: 'selector',
      tag: '📺 哔哩哔哩',
      outbounds: ['direct', 'select', ...出站值]
    }, {
      type: 'selector',
      tag: '📹 油管视频',
      outbounds: ['select', '🌍 国外媒体', 'direct', ...出站值]
    }, {
      type: 'selector',
      tag: '🎬 奈飞视频',
      outbounds: ['select', '🌍 国外媒体', 'direct', ...出站值]
    }, {
      type: 'selector',
      tag: '🎯 全球直连',
      outbounds: ['direct']
    }, {
      type: 'selector',
      tag: '🐟 漏网之鱼',
      outbounds: ['select', 'direct', ...出站值]
    }, ...节点列表572.map(处理节点值出站), {
      type: 'direct',
      tag: 'direct'
    }],
    route: {
      rule_set: [值规则566('cn'), 值规则566('private'), 值规则566('apple'), 值规则566('apple-cn'), 值规则566('microsoft'), 值规则566('microsoft@cn'), 值规则566('google'), 值规则566('telegram'), 值规则566('openai'), 值规则566('anthropic'), 值规则566('youtube'), 值规则566('netflix'), 值规则566('disney'), 值规则566('spotify'), 值规则566('tiktok'), 值规则566('twitter'), 值规则566('facebook'), 值规则566('github'), 值规则566('geolocation-!cn'), 值规则566('category-ads-all'), 地址规则('cn'), 地址规则('private'), 地址规则('telegram')],
      rules: [{
        action: 'sniff'
      }, {
        protocol: 'dns',
        action: 'hijack-dns'
      }, {
        ip_is_private: true,
        outbound: 'direct'
      }, {
        rule_set: 'geosite-category-ads-all',
        action: 'reject'
      }, {
        rule_set: 'geosite-private',
        outbound: 'direct'
      }, {
        rule_set: 'geosite-apple-cn',
        outbound: 'direct'
      }, {
        rule_set: 'geosite-microsoft@cn',
        outbound: 'direct'
      }, {
        rule_set: 'geosite-apple',
        outbound: '🍎 苹果服务'
      }, {
        rule_set: 'geosite-microsoft',
        outbound: 'Ⓜ️ 微软服务'
      }, {
        rule_set: 'geosite-openai',
        outbound: '🤖 OpenAI'
      }, {
        rule_set: 'geosite-anthropic',
        outbound: '🤖 OpenAI'
      }, {
        rule_set: 'geosite-telegram',
        outbound: '📲 电报信息'
      }, {
        rule_set: 'geoip-telegram',
        outbound: '📲 电报信息'
      }, {
        rule_set: 'geosite-google',
        outbound: '🌐 谷歌服务'
      }, {
        rule_set: 'geosite-youtube',
        outbound: '🌍 国外媒体'
      }, {
        rule_set: 'geosite-netflix',
        outbound: '🌍 国外媒体'
      }, {
        rule_set: 'geosite-disney',
        outbound: '🌍 国外媒体'
      }, {
        rule_set: 'geosite-spotify',
        outbound: '🌍 国外媒体'
      }, {
        rule_set: 'geosite-tiktok',
        outbound: '🌍 国外媒体'
      }, {
        rule_set: 'geosite-twitter',
        outbound: '🌍 国外媒体'
      }, {
        rule_set: 'geosite-facebook',
        outbound: '🌍 国外媒体'
      }, {
        rule_set: 'geosite-github',
        outbound: 'select'
      }, {
        rule_set: 'geosite-geolocation-!cn',
        outbound: 'select'
      }, {
        rule_set: 'geosite-cn',
        outbound: 'direct'
      }, {
        rule_set: 'geoip-cn',
        outbound: 'direct'
      }, {
        ip_is_private: true,
        outbound: 'direct'
      }],
      final: '🐟 漏网之鱼',
      // 1.12 起出站解析域名必须显式指定用哪个 DNS，不写 1.14 会直接拒绝启动
      default_domain_resolver: {
        server: 'local'
      },
      auto_detect_interface: true
    },
    experimental: {
      cache_file: {
        enabled: true,
        store_fakeip: true
      },
      clash_api: {
        external_controller: '127.0.0.1:9090'
      }
    }
  };
  return JSON.stringify(配置, null, 2);
}
