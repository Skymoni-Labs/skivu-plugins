# 参与共创

欢迎中文或英文 Issue / PR。先查看 README 的实际接入状态；草案示例不代表已经支持 App 安装。

## 提交新插件

1. 选择当前支持的格式：[Web 插件 SDK 1.0](docs/open-plugin-sdk.md)、[技能/MCP](docs/extensions.md)、[兼容界面预设](docs/runtime.md)。旧 `0.1-draft` 仅作为历史草案保留。
2. 在自己的仓库公开完整可编辑源码、清单、许可证和说明。运行配置由用户填写，不上传 Key、密码、令牌或聊天数据。宿主服务器私有能力不作为插件 API 开放。
3. Web 插件复制 `templates/web-plugin/`，用 `python tools/build_web_plugin.py <目录> --output <输出.skivu.json>` 打包，在 Android App 本地导入并验证；无需先加入官方目录。也可维护自己的 HTTPS 目录。
4. 申请官方收录时提交 `apps/<id>/package.skivu.json`、来源/构建记录与完整可编辑源码，将固定提交、SHA-256 和字节数写入 `catalog/apps.json`。技能/MCP 与预设分别使用自己的目录，保持旧客户端兼容。
5. 提交 PR 说明用途、作者、原始来源、准确许可、声明权限、最低版本、实际验证结果和截图。维护者核验后合并；示例或通过格式校验本身不等于功能通过验收。

## 修改模板与规范

```sh
python tools/validate.py
python -m unittest discover -s tests -v
```

请同步修改文档、格式约束和必要回归检查。内容包路径使用相对路径，不能跳出包目录。CI 不运行投稿内容，不访问投稿 URL，不接触生产账号。

## 来源与许可

只提交有权公开的材料，注明借鉴或复用的文件及实际许可证，保留所需声明。本仓库原创贡献默认按 GPL-3.0-only 提交；独立插件仓库可以声明自己的许可证，不要移除第三方原有许可。

## 维护与下架

存在凭据泄露、冒名、许可证不明、描述与实际权限不符等问题时，维护者可暂停收录或移除目录条目。已发布的独立源码仍由原作者管理。漏洞请按 [SECURITY.md](SECURITY.md) 私密报告，普通功能问题使用 Issue。
