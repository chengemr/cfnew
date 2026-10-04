import { decodeBase64Text as 解码64 } from './encoding.js';
export const defaults = {
  wk: '',
  ev: 'yes',
  et: 'no',
  ex: 'no',
  ech: 'no',
  tp: '',
  customDNS: 'https://223.5.5.5/dns-query',
  customECHDomain: 'cloudflare-ech.com',
  alpn: '',
  d: '',
  p: '',
  yx: '',
  yxURL: '',
  s: '',
  homepage: '',
  scu: 解码64('aHR0cHM6Ly91cmwudjEubWsvc3Vi'),
  ena: 'no',
  epd: 'yes',
  epi: 'yes',
  egi: 'yes',
  ae: '',
  rm: '',
  qj: '',
  dkby: 'no',
  yxby: '',
  ipv4: 'yes',
  ipv6: 'yes',
  ispMobile: 'yes',
  ispUnicom: 'yes',
  ispTelecom: 'yes',
  jk: 'no'
};

export function isEnabled(值, 默认启用 = false) {
  if (值 === undefined || 值 === null || 值 === '') return 默认启用;
  if (值 === true || 值 === false) return 值;
  const 文本 = String(值).trim().toLowerCase();
  if (文本 === 'yes' || 文本 === 'true' || 文本 === '1' || 文本 === 'on') return true;
  if (文本 === 'no' || 文本 === 'false' || 文本 === '0' || 文本 === 'off') return false;
  return 默认启用;
}

export function normalizeSwitch(值, 默认启用 = false) {
  return isEnabled(值, 默认启用) ? 'yes' : 'no';
}

export function normalizeConfig(配置) {
  const 快照 = {
    ...defaults,
    ...配置
  };
  ['ev', 'et', 'ex', 'ech', 'ena', 'epd', 'epi', 'egi', 'dkby', 'ipv4', 'ipv6', 'ispMobile', 'ispUnicom', 'ispTelecom', 'jk'].forEach(键 => {
    快照[键] = normalizeSwitch(快照[键], isEnabled(defaults[键]));
  });
  if (快照.ev === 'no' && 快照.et === 'no' && 快照.ex === 'no') {
    快照.ev = 'yes';
  }
  if (快照.ech === 'yes') {
    快照.dkby = 'yes';
  }
  return 快照;
}

export function resolveConfig(env = {}, stored = {}) {
  return normalizeConfig({ ...readEnvConfig(env), ...stored });
}

function readEnvValue(环境值, ...名称列表) {
  if (!环境值) return undefined;
  for (const 名称 of 名称列表) {
    if (环境值[名称] !== undefined && 环境值[名称] !== null && 环境值[名称] !== '') {
      return 环境值[名称];
    }
  }
  return undefined;
}

export function readEnvConfig(环境值 = {}) {
  const 别名 = {
    customDNS: ['CUSTOM_DNS'], customECHDomain: ['CUSTOM_ECH_DOMAIN'],
    yxURL: ['YX_URL'], ispMobile: ['ISP_MOBILE'],
    ispUnicom: ['ISP_UNICOM'], ispTelecom: ['ISP_TELECOM']
  };
  const 快照 = {};
  for (const 键 of Object.keys(defaults)) {
    const 值 = readEnvValue(环境值, 键, 键.toUpperCase(), ...(别名[键] || []));
    if (值 !== undefined) 快照[键] = 值;
  }
  return 快照;
}
