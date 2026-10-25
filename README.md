# Skivu Plugins

Skivu 社区插件共创仓库。欢迎为 [Skivu 手机 App](https://github.com/skyjjgw/skivu) 创作扩展、分享源码和提交收录申请。

**Skivu 0.2.19 起支持从 App 插件市场安装 QQ、微信界面包。** 在市场安装后开启使用，也可以关闭或卸载；角色和聊天记录继续由原 App 保存。0.2.18 及更早版本需要先更新 App。

**Skivu 0.2.38 / SDK 1.0 开放独立 Web 插件。** 自带 HTML/CSS/JavaScript、资源和业务逻辑，可提供独立页面、聊天动作或整个聊天界面。宿主 API 按用户授权提供隔离存档/文件/第三方密钥、网络、角色/聊天交互和模型生成代理。无需第三方 ID/renderer 白名单，可本地导入或添加自己的目录。服务器私有能力、配置和凭据不开放。见[开放 SDK](docs/open-plugin-sdk.md)、[可复制模板](templates/web-plugin/)和[打包工具](tools/build_web_plugin.py)。实际插件包由服务器目录分发，不内置 APK。

Skivu 0.2.36 新增[技能与 MCP 扩展](docs/extensions.md)：安装并主动启用任务指导，或配置自己的 HTTPS MCP 服务、选择工具手动执行。扩展目录为 `catalog/extensions.json`，协议 `2.0`。每个包保留作者、固定上游提交、许可原文、修改声明和可编辑源码。依赖未接入工具或执行环境的项目须适配后收录。

界面包仍使用 `ui-preset` 和 `catalog/index.json` 协议 `1.0`，保持旧客户端兼容；这种数据预设不执行脚本。开放插件另用 `catalog/apps.json` 协议 `3.0`，在独立运行环境执行自带 Web 代码。旧 `0.1-draft` 投稿格式继续保留。

## 开始创作

1. Fork 本仓库，或在自己的 GitHub 仓库开发。
2. 阅读[开放 SDK](docs/open-plugin-sdk.md)，复制 `templates/web-plugin/`，修改清单、页面与业务代码。技能/MCP 或旧数据预设使用各自格式；`prompt-pack` 仅为历史草案。
3. 在自己的源码仓库保留许可证和必要的第三方声明。独立插件可选择自己的开源许可证，并在清单中准确声明。
4. 运行下方检查。需要收录时按 [贡献指南](CONTRIBUTING.md) 提交 PR；功能或接口建议可直接发 Issue。

```sh
python -m pip install -r requirements-dev.txt
python tools/validate.py
python -m unittest discover -s tests -v
# 构建可在 App 本地导入的独立插件：
python tools/build_web_plugin.py templates/web-plugin --output dist/plugin-lab.skivu.json
python tools/build_web_plugin.py --check dist/plugin-lab.skivu.json
# 检查仓库外的旧草案/数据预设：
python tools/validate.py --package /path/to/your/plugin
```

## 仓库内容

[角色小手机 1.1.1](docs/pocket-phone.md) 提供21个角色生活应用、独立存档、音乐与可选多轮聊天面板。安装包、完整可编辑源码与构建记录均在本仓库，兼容 Skivu 0.2.38 / SDK 1.0。

| 路径 | 用途 |
| --- | --- |
| `templates/prompt-pack/` | 可复制的提示词内容包模板 |
| `examples/writing-assistant/` | 原创写作助手示例，供本地查看与修改 |
| `schemas/` | JSON 清单和社区目录格式 |
| `plugins/qq/`、`plugins/wechat/` | 首批可安装的界面包、说明与完整许可 |
| `catalog/index.json` | App 安装目录，固定包提交、SHA-256 和字节数 |
| `catalog/extensions.json`、`extensions/` | 技能与 MCP 扩展目录、包及源码 |
| `catalog/apps.json`、`apps/` | 开放 Web 插件目录、完整包与来源 |
| `templates/web-plugin/`、`sdk/` | 可编辑交互示例与 SDK 类型定义 |
| `catalog/drafts.json` | 旧版草案目录，保持 `runtimeReady: false` |
| `docs/` | 开发、目录收录、权限和路线说明 |
| `tools/validate.py` | 只读取文件的格式与本地资源检查 |

## 社区与官方市场

大家可以自由 Fork、开发和发布；官方目录由维护者审核、合并和下架。提交 PR 不需要仓库写权限。收录会展示作者、源码、版本、许可证和权限，不能替代用户的安装选择。

欢迎继续提交内容包、渲染器改进和新能力提案。技能不自动获得设备权限，MCP 使用用户配置的远端 HTTP 服务。Android 专有接口、stdio 服务和本机可执行脚本需要各自的宿主适配；更改渲染器需提交 App 源码并更新 App。见 [扩展格式](docs/extensions.md)、[运行格式](docs/runtime.md) 与 [路线图](docs/roadmap.md)。

原创仓库文件和内置模板采用 [GPL-3.0-only](LICENSE)。第三方独立仓库的插件以其自身声明为准；收录不会改变作者的许可证。项目中没有复用其他 App 的插件宿主或运行时代码。
