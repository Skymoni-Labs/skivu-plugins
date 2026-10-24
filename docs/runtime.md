# 可安装界面包 1.0

本文仅描述保留兼容的 QQ/微信数据预设。自由创作独立应用、聊天动作或聊天界面请使用[开放 Web 插件 SDK 1.0](open-plugin-sdk.md)；技能/MCP 见 [extensions.md](extensions.md)。新 SDK 没有下文的第三方 ID/renderer 白名单。

App 0.2.19 开放插件市场，读取 `catalog/index.json`。每个条目包含与 `plugins/*/plugin.json` 相同的字段，额外带 `package: {url, sha256, bytes}`。URL 必须固定本仓库的40位提交，不使用可变分支；先提交包文件，再以该提交生成目录。

App 优先通过 `https://skymoni.com/app-plugins/catalog/index.json` 获取核对过的目录，并从 `/app-plugins/packages/{sha256}.json` 下载相同字节的安装包，方便国内用户使用。GitHub保留源码、固定提交和原地址，作为转发不可用时的备用源。服务端每次收录新包后同步经过大小与摘要验证的公开JSON；不会转发用户账号、聊天或密钥，也不要求手机直连GitHub。

宿主仅接受 `skivu.qq` / `skivu.wechat`、`kind: ui-preset`、`renderer: skivu.social-ui.v1`、空 permissions、正确模式与来源，且满足 minHostVersion。下载上限16KiB，校验原始UTF-8字节的SHA-256与长度，再比对全部字段，持久化后才显示已安装。不接受外部URL、入口脚本或额外权限。更新拒绝降级，失败保留旧包。离线可启用已安装版本，卸载先关闭对应模式，保留角色、记录和外观。

这是真正下载并安装的**数据型预设包**，并非可远程替换宿主代码的脚本插件。QQ/微信界面的完整原创代码、依赖与许可随 App 源码发布。包本身不能变更渲染器、自动授予设备权限、接入腾讯账号或执行真实支付。

运行清单约束见 `tools/runtime_schema.py`；`tools/validate.py` 校验已收录包与目录的元数据、大小和SHA-256一致。CI 不执行投稿内容，也不下载投稿仓库。新 SDK 的包结构与能力另行校验，不通过修改数据预设字段来授予能力。
