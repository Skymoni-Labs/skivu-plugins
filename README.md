# Skivu Plugins

Skivu 社区插件共创仓库。欢迎为 [Skivu 手机 App](https://github.com/skyjjgw/skivu) 创作扩展、分享源码和提交收录申请。

**当前阶段：开发规范预览。App 尚未接入插件加载、安装、执行和更新；这里的示例不能直接在现有 App 内运行。** 协议为 `0.1-draft`，可能随宿主实现调整；可先提交提案和不依赖宿主的内容包。

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
| `catalog/index.json` | 社区收录目录；目前为空，`runtimeReady: false` |
| `docs/` | 开发、目录收录、权限和路线说明 |
| `tools/validate.py` | 只读取文件的格式与本地资源检查 |

## 社区与官方市场

大家可以自由 Fork、开发和发布；官方目录由维护者审核、合并和下架。提交 PR 不需要仓库写权限。收录会展示作者、源码、版本、许可证和权限，不能替代用户的安装选择。

首个草案只描述**纯文本提示词包**：没有 JavaScript、Dart、原生代码或脚本执行能力，也没有系统、文件、网络或账号权限。语音服务适配、工具调用和可执行扩展需要后续单独设计宿主接口与授权机制，见 [路线图](docs/roadmap.md)。

原创仓库文件和内置模板采用 [GPL-3.0-only](LICENSE)。第三方独立仓库的插件以其自身声明为准；收录不会改变作者的许可证。项目中没有复用其他 App 的插件宿主或运行时代码。
