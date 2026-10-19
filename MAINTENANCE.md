# 停止维护与部署收尾

CFnew 于 **2026-10-19** 停止维护。不再处理 Issue 或 Pull Request，不再提供功能更新、问题修复、安全更新或技术支持。源码、提交历史及历史版本保留供查阅。

最后一个正式版本为 [v4.0.7](https://github.com/chengemr/cfnew/releases/tag/v4.0.7)，提供 `Pages.zip`、`_worker.js`、`_worker.obfuscated.js` 和 `SHA256SUMS.txt`。这表示最后一次正式发布，不代表对未来 Cloudflare 或客户端版本的兼容性承诺。现有部署由部署者自行决定是否继续使用并承担后续维护。

## 停用自己的 Cloudflare 部署

GitHub 仓库归档只影响仓库，不会停止 Cloudflare Worker／Pages，也不会取消云服务账单。下列事项需要在部署者自己的账户中处理；本文不代表这些操作已经完成。

1. 如有其他使用者，提前通知停止服务的时间，留出迁移或保存配置的时间。
2. 在关闭服务前，备份需要保留的配置和 KV 数据。备份可能包含 UUID、代理密码或订阅信息，请保存在私有位置，不要提交到 GitHub。
3. 在 Cloudflare 控制台找到对应 Worker／Pages，确认名称、路由和自定义域名；停用不再需要的路由、触发器及自动部署，停止服务。确认备份可用且服务不再需要后，再删除相应项目或部署。
4. 撤销仅供该项目使用的 Cloudflare API Token，以及不再使用的上游代理或第三方服务凭据；检查 CI、Webhook 和外部定时任务。共用凭据或资源需先确认其他服务不再依赖。
5. 核对 Cloudflare 计费、付费订阅、域名续费及第三方服务账单，取消不再需要的付费项目。删除部署不等于取消所有订阅。
6. 最后确认旧 Worker／Pages 地址、自定义域名及订阅链接均已停止提供该服务。KV 数据只在备份完成并确认没有其他用途后删除。

开发与构建步骤仍保留在 [CONTRIBUTING.md](CONTRIBUTING.md)，历史部署兼容性说明见 [PAGES-UPDATE.md](PAGES-UPDATE.md)。
