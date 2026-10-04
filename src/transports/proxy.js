const 错误_无效代理地址 = atob('SW52YWxpZCBTT0NLUyBhZGRyZXNzIGZvcm1hdA==');
const 前缀_套接字5 = atob('c29ja3M1Oi8v');
const 前缀_套接字 = atob('c29ja3M6Ly8=');
const 前缀_超文本 = atob('aHR0cDovLw==');
const 前缀_安全超文本 = atob('aHR0cHM6Ly8=');
const 代理种类_套接字5 = 'p5';
const 代理种类_隧道 = 'pt';
const 代理种类_安全隧道 = 'pts';

export function parseProxy(地址249) {
  let 剩余地址 = String(地址249 || '').trim();
  // 按前缀识别代理种类，无前缀保持原有行为（套接字5）
  let 代理种类 = 代理种类_套接字5;
  const 小写地址 = 剩余地址.toLowerCase();
  if (小写地址.startsWith(前缀_安全超文本)) {
    代理种类 = 代理种类_安全隧道;
    剩余地址 = 剩余地址.slice(前缀_安全超文本.length);
  } else if (小写地址.startsWith(前缀_超文本)) {
    代理种类 = 代理种类_隧道;
    剩余地址 = 剩余地址.slice(前缀_超文本.length);
  } else if (小写地址.startsWith(前缀_套接字5)) {
    剩余地址 = 剩余地址.slice(前缀_套接字5.length);
  } else if (小写地址.startsWith(前缀_套接字)) {
    剩余地址 = 剩余地址.slice(前缀_套接字.length);
  }
  // 去掉可能存在的尾部路径，只留 认证@主机:端口
  const 路径位置 = 剩余地址.indexOf('/');
  if (路径位置 >= 0) 剩余地址 = 剩余地址.slice(0, 路径位置);
  if (!剩余地址) throw new Error(错误_无效代理地址);
  let [本地值248, 本地值247] = 剩余地址.split("@").reverse();
  let 本地值246, 密码245, 主机名244, 代理端口;
  if (本地值247) {
    const 本地值243 = 本地值247.split(":");
    if (本地值243.length !== 2) throw new Error(错误_无效代理地址);
    [本地值246, 密码245] = 本地值243;
  }
  const 本地值242 = 本地值248.split(":");
  const 末段值 = 本地值242.pop();
  代理端口 = Number(末段值);
  // 隧道模式允许省略端口，按明文 80 / 安全 443 兜底
  if (isNaN(代理端口)) {
    if (代理种类 === 代理种类_套接字5) throw new Error(错误_无效代理地址);
    本地值242.push(末段值);
    代理端口 = 代理种类 === 代理种类_安全隧道 ? 443 : 80;
  }
  主机名244 = 本地值242.join(":");
  if (!主机名244) throw new Error(错误_无效代理地址);
  if (主机名244.includes(":") && !/^\[.*\]$/.test(主机名244)) throw new Error(错误_无效代理地址);
  return {
    username: 本地值246,
    password: 密码245,
    hostname: 主机名244,
    socksPort: 代理端口,
    kind: 代理种类
  };
}
