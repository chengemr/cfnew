# 开发与验证

开发使用 Node.js 18 或 24：

```sh
npm ci
npm run build
npm run obfuscate
npm run check
npm run test:all
```

修改 `src/` 中的模块，再生成并提交根目录的 `明文源吗` 与 `少年你相信光吗`。两份产物仍可按原方式直接部署；构建工具和 YAML 解析器仅用于开发，Worker 没有新增运行时依赖。

| 模块 | 内容 |
| --- | --- |
| `src/config.js`、`src/runtime.js` | 配置归一化与每个请求的独立快照 |
| `src/storage.js`、`src/api.js` | 按 KV 绑定缓存、串行保存和管理接口 |
| `src/auth.js` | 独立管理密钥、Bearer 认证、签名会话和来源检查 |
| `src/preferred.js` | 优选地址解析、IPv6 校验与序列化 |
| `src/router.js` | 管理路径与端点匹配 |
| `src/pages/` | 首页、订阅管理页及共享语言判断 |
| `src/subscriptions/` | 共享节点生成、客户端格式和家宽订阅 |
| `src/transports/outbound.js` | 共用出站顺序、套接字生命周期与代理握手 |
| `src/transports/protocols.js` | VLESS/Trojan 首包、UUID 和 XHTTP 请求头解析 |
| `src/transports/sessions.js` | WS/XHTTP 会话、DNS 转发与取消处理 |
| `src/transports/` 其余模块 | 代理参数、XHTTP 填充与流转发 |
| `src/worker.js` | 请求入口、节点来源与订阅组装 |

常规测试从实际 Worker 请求入口验证行为，模拟 KV、套接字及 WebSocket，并阻止外网访问。连接测试包含 Cloudflare BYOB 接口的测试适配；它们不能替代实际 Worker 部署测试。

Clash 的 `+.hdslb.com` 查询固定使用两个国内 DoH 解析器，避免可用 CDN 地址被全局 `fallback-filter` 替换。`proxy-server-nameserver` 也使用这两个解析器，单独完成代理节点域名解析，避免境外节点 IP 触发网站备用 DNS 并阻塞建连。网站查询仍使用自定义 DNS 与原有备用策略。主选择组首次导入时选择第一个节点，已有客户端保存的选择仍由客户端决定。YAML 锚点复用相同列表，不改变业务组的节点选择范围或节点顺序；保留上游已有的微软服务和应用净化组，即使默认规则未引用它们。

`npm ci` 包含固定版本的开发依赖 Playwright。安装 Chromium 后运行真实浏览器的管理页测试：

```sh
npx playwright install --with-deps chromium
npm run test:browser
CFNEW_WORKER_FILE=少年你相信光吗 npm run test:browser
```

Linux x86_64 可使用校验官方发布摘要的脚本安装固定版本 Mihomo，再运行真实内核的隔离图片请求和节点域名连接测试；其他平台可设置已有二进制路径：

```sh
bash scripts/install-mihomo.sh /tmp/cfnew-bin
CFNEW_MIHOMO_BIN=/tmp/cfnew-bin/mihomo npm run test:mihomo
CFNEW_WORKER_FILE=少年你相信光吗 CFNEW_MIHOMO_BIN=/tmp/cfnew-bin/mihomo npm run test:mihomo
```

CI 在 Node 18/24 上检查两种产物的一致性与入口回归，并分别执行两种产物的 Chromium 和 Mihomo 测试。测试工具只用于开发，不进入部署文件。

测试使用本地 DNS、图片服务器和 HTTP 代理，分别验证备用 DNS 不响应时失败、图片策略或节点专用 DNS 生效后成功，并检查成功路径没有查询备用 DNS。节点测试复现公共解析流程，不测试 VMess 的加密、WS 或 TLS。真实网络验收应在原故障网络更新订阅、清理 DNS 缓存，再检查原图片与本地追加节点。

请求设置不存放在模块级变量中，异步订阅与长连接始终使用入口捕获的配置。KV 缓存按绑定隔离，并合并同时发生的冷读取；同一 isolate 内的保存串行执行，保存前强制完整读取 `c`，绕过请求缓存和版本键快捷路径，避免本地旧缓存回滚另一实例已完成的保存。失败写入不发布到缓存；读取失败或 JSON 损坏时拒绝部分写入，避免丢失未知配置。普通读取保留 30 秒缓存窗口，每 5 分钟完整读取一次，避免版本键写入失败或读取不一致导致缓存永久滞留。KV 跨 isolate 的最终一致性仍由 Cloudflare 决定，这不是跨 isolate 的原子事务；需要严格并发更新时应使用支持串行写入或事务的存储。

XHTTP 只对连续 45 秒没有上下行数据的连接执行空闲关闭，上传 EOF 后继续读取远端响应。不完整请求头在 5 秒后返回 408；正常结束、超时和取消均清理读取锁、写入锁及计时器。优选源的超时覆盖响应体读取，失败不会再次发起无超时请求。

WS、XHTTP 和 DNS 共用出站顺序与连接所有权；TCP 建连、代理握手及 WS 首次写入共用 5 秒截止时间。客户端取消时关闭待连接和竞速套接字。`qj=only` 同样约束 DNS，但 DNS 保留原来的 `8.8.4.4:53` 目标和 TCP 帧格式，不使用 ProxyIP 的 443 端口作为 DNS 回退。公网验收仍应在实际 Worker/Pages 上检查连接超时、背压与中断。

WS 从消息入口预留待处理字节，early data、ReadableStream 积压、上传队列及正在
写入的字节共用 256 KiB 限额。首响应前需要回退重放的已写字节也计入该预算；
首响应到达或切换到不再重试的连接后释放已完成上传的预留，超限关闭连接。回退
完整重放首包和后续上传，旧 writer 的迟到回调不会影响新连接。首包认证
期限为 5 秒，认证成功或结束时清除。DNS 复用一条上游 TCP 连接，上传与下载独立；
分片长度前缀和多帧内容原样转发，VLESS 响应头仅发送一次。未完整回答的查询／分片
等待 5 秒超时，已回答后的空闲期限为 45 秒，取消时关闭上游并释放流锁和计时器。

配置 API 在写入 KV 前检查字段类型、开关/出站/ALPN 枚举和长度；空字符串或
`null` 继续表示恢复环境变量和默认值。未知扩展字段保留。无效 JSON 和字段返回
400。优选 API 的无效批次整体拒绝，不部分保存；名称最多 256 字符，不能包含
逗号、`#` 或换行，避免破坏现有 `host:port#name,host:port#name` 存储格式。

外部请求截止时间覆盖响应头和正文：内置优选源 3 秒、自定义优选源 5 秒，正文最多
1 MiB；自定义首页 5 秒、正文最多 2 MiB。优选源失败后只使用其他已启用且有效的
节点来源，全部为空时返回 HTTP 503，各格式不再成功返回 `127.0.0.1` 占位节点。
不会自动开启禁用的来源，也尚未实现最近成功节点缓存。首页失败仍回退默认页面。
部署时必须配置有效的 `u` 或 `U`，支持带连字符或 32 位十六进制 UUID。

管理页面、配置 API、优选 API 和状态接口需要独立 `ADMIN_TOKEN`；缺失、不合法或
复用订阅凭据时返回 503，不影响订阅与代理。API 支持 Bearer 密钥，浏览器登录签发
8 小时 HMAC-SHA256 会话 Cookie，带 HttpOnly、SameSite=Strict（HTTPS 带 Secure）。
Cookie 认证的修改请求必须同源，登录也拒绝跨源请求。密钥只来自环境，不进入
配置 JSON、页面 bootstrap、URL 或浏览器存储。退出清除 Cookie，轮换密钥废止旧会话。
兼容单文件需要在顶部配置私有 UUID，默认留空且拒绝旧公开示例值。

各客户端按真实协议能力过滤节点，过滤后为空返回 422；INI 无法表示的密码返回
兼容错误，原生／JSON／YAML 格式保留原密码。家宽组引用使用统一 YAML 转义。
没有定时优选任务，Worker 也不主动获取 ECH 配置；ECH 参数由支持的客户端消费。
