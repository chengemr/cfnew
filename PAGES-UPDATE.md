# Pages 更新与兼容性

当前版本为 **v4.0.5**，基于原版 v3.1；现有 KV 数据格式无需迁移。

部署前确认环境变量 `u` 或 `U` 是有效 UUID（带连字符或 32 位十六进制均可）。
本版本不再使用源码中的公开默认凭据；缺失或非法时返回 503 配置错误。
保留原 KV 绑定 `C`、域名、路径和其他环境变量。

更新此修复前另行设置环境 Secret `ADMIN_TOKEN`（32–256 个字母、数字、`_` 或 `-`，
推荐随机 64 位十六进制值）。不能与 `U`、Trojan 密码或自定义路径复用。
管理入口需要此密钥；缺失或无效时返回 503，原订阅链接和代理继续工作，无需修改订阅链接。
从 `/` 输入原 UUID／自定义路径与管理密钥登录；API 加 `Authorization: Bearer <ADMIN_TOKEN>`。
密钥不存入 KV，也不放入订阅链接。浏览器会话有效 8 小时；轮换密钥使旧会话失效。
兼容单文件 `edgetunnel经典轻量版`、`snippets` 则需在文件顶部填写私有 UUID，默认留空，
不读取 `u/U` 环境变量，拒绝旧公开示例凭据。

`src/` 为维护源码，执行 `npm ci && npm run build && npm run obfuscate` 后，
将根目录的 `明文源吗` 复制为部署目录中的 `_worker.js`。构建目录和 ZIP 归档不提交。
保留原项目的域名、环境变量和 KV 绑定 `C`；兼容日期使用原项目文档的 `2026-01-20`。

Direct Upload 项目可按原项目流程上传 `_worker.js`；Git 集成项目使用原 Git 部署流程。
本仓库的修改不自行部署 Cloudflare，也不修改现有 KV 数据。部署后检查管理页、配置
保存、订阅更新、DNS 缓存与实际客户端连接；异常时使用原项目部署回滚。

## v4.0.5 直连 DNS 更新

Clash／Mihomo 订阅的 `DIRECT` 出口单独使用国内 DoH，避免非中国 IP 的解析
触发通用 fallback 后，因备用 DNS 不可达而导致直连超时。Apple 默认直连组和
客户端追加的 MDPI 等直连规则都适用。

上传 v4.0.5 部署文件后，刷新客户端订阅并重启内核；原订阅链接不变。
在客户端的最终配置中确认 `dns.direct-nameserver` 包含
`https://223.5.5.5/dns-query` 与 `https://119.29.29.29/dns-query`，
且 `direct-nameserver-follow-policy` 为 `false`。启用了 DNS 覆写时，需在覆写
配置中同步这些设置。仅开启系统代理、需要沿用校园网系统 DNS 时，可将
`direct-nameserver` 改为 `["system://"]`；TUN 模式下先确认 DNS 劫持不会造成循环。

## 下载部署 ZIP

正式版本在 [GitHub Releases](https://github.com/chengemr/cfnew/releases) 下载。
选择目标版本，下载 **Pages.zip**；同一 Release 还提供明文 `_worker.js`、
混淆 `_worker.obfuscated.js` 和 `SHA256SUMS.txt`。正式发布文件不受 Actions
产物的 30 天保留期限限制；GitHub 自动附带的 Source code 是开发源码，不是 Pages 部署包。

开发分支的部署包可从 Actions 获取：

登录 GitHub，进入仓库 **Actions → Generate and Obfuscate Worker Script**，
打开与目标分支和提交对应的成功运行，在 **Artifacts** 下载 `cfnew-pages-<提交 SHA>`。
下载文件为 ZIP，根目录只有 `_worker.js`，可用于 Pages Direct Upload。
产物保留 30 天，过期后可在目标分支重新运行该工作流生成。
部署 ZIP 不包含生产变量、KV 数据或本地配置。Git 集成项目继续使用 Git 部署流程。

## 保留与改进

- 保留原环境变量及 KV `c` / `c_ver` 格式，不需要数据迁移。
- 将单文件源码拆为配置、KV、路由、页面、订阅和传输模块，部署仍为独立单文件。
- 请求配置独立快照，KV 缓存按绑定隔离；失败保存不发布缓存，失败读取不能覆盖旧数据。
- 保存前完整读取配置，避免旧请求缓存覆盖另一实例已经保存的字段。
- 管理凭据独立于订阅，页面/API/状态接口均受保护，支持签名 Cookie 与 Bearer。
- 支持多级管理路径、显式域名端口及 IPv6；非法地址和端口不生成优选节点。
- 管理页面支持中文／波斯语、手机布局、差量保存、失败重试、复制／导入／下载，
  并保留最快 10 个、多个机房筛选及多 URL 优选来源。
- Clash 使用独立 `proxy-server-nameserver` 解析节点、`direct-nameserver` 解析直连出口，保留其他网站 DNS、CDN 策略与原策略组。
- XHTTP 上传 EOF 后继续读取远端响应；空闲、截断报文、取消和异常清理有回归覆盖。
- DNS 在同一 TCP 连接上持续收发多条查询，保留长度前缀与一次 VLESS 响应头；
  等待完整回答 5 秒或空闲 45 秒超时，断开时清理连接。
- WS 消息入口对全部待处理字节设置 256 KiB 限额，首包认证期限为 5 秒。
- WS 首响应前的上传历史同样计入预算，回退重放完整数据并隔离旧连接的迟到回调。
- 全部启用来源没有有效节点时，订阅返回 503；保留已有来源开关，不生成占位节点。
- 客户端格式不兼容、过滤后无节点或 INI 无法表示密码时返回 422；XHTTP 过滤 HTTP 端口。

## 验证范围与限制

运行命令与测试边界见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [tests/README.md](tests/README.md)。
测试夹具使用文档示例、内存 KV 与本地网络服务，不包含用户生产凭据。
原生 Mihomo DNS 对照验证公共解析流程，不能替代 VMess/VLESS/Trojan 加密、WS、TLS
及用户网络中的端到端连接验收。Cloudflare KV 跨 isolate 仍为最终一致，不是原子事务。

端点延迟探测沿用 `nip.lfree.org`，依赖浏览器 CORS 与端点可达性；它不测代理出口或
吞吐量，且探测端点暂不支持 IPv6。IPv6 配置与订阅生成仍可使用。

仅启用 XHTTP 时，使用 V2Ray 等支持原生 XHTTP 的客户端；Clash、Sing-box 等
转换格式会返回明确的 422 不兼容提示。若同时启用 Trojan，只输出兼容的 Trojan 节点；
启用 VLESS-WS 时继续保留原有转换行为。Worker 的协议接收范围未扩大。
本次审查不会以测试夹具的成功宣称生产连接已经通过。
