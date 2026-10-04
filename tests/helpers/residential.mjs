const configuration = `proto tcp
remote 192.0.2.20 443
cipher AES-128-CBC
auth SHA1
<ca>
fixture-ca
</ca>
<cert>
fixture-certificate
</cert>
<key>
fixture-key
</key>`;

// Synthetic public-list fixture; no real certificates or network access.
export const residentialList = [
  '#HostName,IP,Score,Ping,Speed,CountryLong,CountryShort',
  ['fixture', '192.0.2.20', '100', '10', '100000', 'Japan', 'JP',
    '0', '0', '0', '0', '0', 'fixture', 'fixture', btoa(configuration)].join(',')
].join('\n');

export function residentialResponse(url) {
  if (String(url) !== 'https://www.vpngate.net/api/iphone/') {
    throw new Error(`Unexpected fixture request: ${url}`);
  }
  return new Response(residentialList);
}
