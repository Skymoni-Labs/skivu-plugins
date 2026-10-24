# 技能与 MCP 扩展

Skivu 0.2.36 新增独立扩展目录 `catalog/extensions.json`（协议 `2.0`）。已有 `catalog/index.json` 和 QQ、微信界面包协议保持兼容。

`skill` 是可安装的任务指导，安装后需主动开启，才会在下一次模型请求中附带指令与内嵌参考资料。关闭后不再附带。它不会执行 shell、Python、JavaScript 或修改本机文件。需要这些能力的上游 Skill 要另行适配，不能仅把文件名收录后描述为完整接入。每次启用的指导与参考资料合计最多 64 KiB，本机安装库最多 16 MiB。

`mcp-http` 使用 MCP Streamable HTTP：用户填写 HTTPS 服务地址与可选 Bearer 密钥，初始化后获取工具列表，选择工具、填写 JSON 参数并手动执行。结果可查看和复制。密钥只存设备安全存储；不会共用模型密钥，不跟随 HTTP 跳转，不启动上游进程，不提供 sampling、roots 或后台自动调用。stdio/SSE 旧传输和 OAuth 自动授权需单独适配。

每个扩展目录包含 `package.json`、`provenance.json` 以及可编辑的 `source/`。目录固定包的 Git 提交、字节数和 SHA-256；安装校验通过后才替换原版本。安装失败、版本不兼容和校验失败不会覆盖已有版本。

第三方内容保留原许可证、版权和 NOTICE。逐目录审查覆盖仓库级许可标签：同一仓库可能有不同许可。对于 GPL、AGPL、LGPL、MPL 等项目，须核对具体适配方式的源码、修改声明及再分发义务；对于 CC BY-SA 材料，保留署名、许可和修改声明并按要求采用相同许可。不明确的许可和缺少必需源码的项目留在审核队列。

验证：`python tools/validate.py`。验证只读取包，不执行第三方代码。上游固定提交与文件摘要见各扩展的 `provenance.json`。
