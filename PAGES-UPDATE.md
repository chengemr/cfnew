# Pages 更新与兼容性

当前版本为 **v4.0.2**，基于原版 v3.1；现有 KV 数据格式无需迁移。

部署前确认环境变量 `u` 或 `U` 是有效 UUID（带连字符或 32 位十六进制均可）。
本版本不再使用源码中的公开默认凭据；缺失或非法时返回 503 配置错误。
保留原 KV 绑定 `C`、域名、路径和其他环境变量。

绑定 KV 后，订阅链接也暴露配置 API 的管理路径，持有人能读写配置，`ae=no` 无法
保护该接口。拆分独立管理凭据是后续任务；分享订阅前必须先解决此权限问题。

`src/` 为维护源码，执行 `npm ci && npm run build && npm run obfuscate` 后，
将根目录的 `明文源吗` 复制为部署目录中的 `_worker.js`。构建目录和 ZIP 归档不提交。
保留原项目的域名、环境变量和 KV 绑定 `C`；兼容日期使用原项目文档的 `2026-01-20`。

Direct Upload 项目可按原项目流程上传 `_worker.js`；Git 集成项目使用原 Git 部署流程。
本仓库的修改不自行部署 Cloudflare，也不修改现有 KV 数据。部署后检查管理页、配置
保存、订阅更新、DNS 缓存与实际客户端连接；异常时使用原项目部署回滚。

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
- 支持多级管理路径、显式域名端口及 IPv6；非法地址和端口不生成优选节点。
- 管理页面支持中文／波斯语、手机布局、差量保存、失败重试、复制／导入／下载，
  并保留最快 10 个、多个机房筛选及多 URL 优选来源。
- Clash 使用独立 `proxy-server-nameserver` 解析节点，保留网站 DNS、CDN 策略与原策略组。
- XHTTP 上传 EOF 后继续读取远端响应；空闲、截断报文、取消和异常清理有回归覆盖。
- DNS 在同一 TCP 连接上持续收发多条查询，保留长度前缀与一次 VLESS 响应头；
  等待完整回答 5 秒或空闲 45 秒超时，断开时清理连接。
- WS 消息入口对全部待处理字节设置 256 KiB 限额，首包认证期限为 5 秒。
- 全部启用来源没有有效节点时，订阅返回 503；保留已有来源开关，不生成占位节点。

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
