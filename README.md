# Skivu Plugins

Skivu 社区插件共创仓库。欢迎为 [Skivu 手机 App](https://github.com/skyjjgw/skivu) 创作扩展、分享源码和提交收录申请。

**Skivu 0.2.19 起支持从 App 插件市场安装 QQ、微信界面包。** 在市场安装后开启使用，也可以关闭或卸载；角色和聊天记录继续由原 App 保存。0.2.18 及更早版本需要先更新 App。

首版运行格式为 `ui-preset`：经校验的 JSON 数据选择 App 内置、随 App 审阅发布的渲染器，不下载执行外部 HTML/JavaScript。目录协议为 `1.0`，包需要满足宿主版本；完整渲染器源码在 [Skivu assets/social_ui](https://github.com/skyjjgw/skivu/tree/main/assets/social_ui)。纯文本提示词格式仍为 `0.1-draft`，目前可投稿但尚不能在 App 安装。

## 开始创作

1. Fork 本仓库，或在自己的 GitHub 仓库开发。
2. 阅读 [开发规范](docs/development.md)，复制 `templates/prompt-pack/`，填写 `plugin.json` 并修改提示词内容。
3. 在自己的源码仓库保留许可证和必要的第三方声明。独立插件可选择自己的开源许可证，并在清单中准确声明。
4. 运行下方检查。需要收录时按 [贡献指南](CONTRIBUTING.md) 提交 PR；功能或接口建议可直接发 Issue。

```sh
python -m pip install -r requirements-dev.txt
python tools/validate.py
python -m unittest discover -s tests -v
# 检查仓库外的独立内容包：
python tools/validate.py --package /path/to/your/plugin
```

## 仓库内容

| 路径 | 用途 |
| --- | --- |
| `templates/prompt-pack/` | 可复制的提示词内容包模板 |
| `examples/writing-assistant/` | 原创写作助手示例，供本地查看与修改 |
| `schemas/` | JSON 清单和社区目录格式 |
| `plugins/qq/`、`plugins/wechat/` | 首批可安装的界面包、说明与完整许可 |
| `catalog/index.json` | App 安装目录，固定包提交、SHA-256 和字节数 |
| `catalog/drafts.json` | 旧版草案目录，保持 `runtimeReady: false` |
| `docs/` | 开发、目录收录、权限和路线说明 |
| `tools/validate.py` | 只读取文件的格式与本地资源检查 |

## 社区与官方市场

大家可以自由 Fork、开发和发布；官方目录由维护者审核、合并和下架。提交 PR 不需要仓库写权限。收录会展示作者、源码、版本、许可证和权限，不能替代用户的安装选择。

欢迎继续提交内容包、渲染器改进和新能力提案。当前安装器仅接受两种已适配的官方界面包，不提供任意第三方脚本执行或官方微信/QQ联网服务；更改渲染器需提交 App 源码并更新 App。语音适配、工具调用和可执行扩展仍需单独设计接口，见 [运行格式](docs/runtime.md) 与 [路线图](docs/roadmap.md)。

原创仓库文件和内置模板采用 [GPL-3.0-only](LICENSE)。第三方独立仓库的插件以其自身声明为准；收录不会改变作者的许可证。项目中没有复用其他 App 的插件宿主或运行时代码。
