# 开发规范 0.1-draft

这是独立设计的 Skivu 内容包草案，尚未冻结，也不是现有 App SDK。先支持可审阅的纯文本提示词，不声明兼容其他 App 的插件格式。

## 包结构

```text
my-plugin/
  plugin.json
  prompts/system.md
  README.md
  LICENSE
```

复制 `templates/prompt-pack/` 后修改作者、唯一 ID、名字、说明、仓库地址和提示词。包内容使用 UTF-8；入口限 `.md` 或 `.txt`，最大 256 KiB。单个包的 ID 采用 `作者.插件名` 形式（小写 ASCII、数字、点、横线），例如 `skivu.writing-assistant`。

## plugin.json

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 固定为 `1`，指清单结构，不是宿主 API 版本 |
| `id` | 稳定唯一标识，改名不应改 ID |
| `name` / `description` | 面向手机用户的名称与简短用途 |
| `version` | `主.次.修订`，例如 `0.1.0`；草案暂不接受预发布后缀 |
| `author` | 作者显示名 |
| `license` | 准确的 SPDX 标识或表达式；校验器只检查非空，维护者另核对实际文件 |
| `repository` | GitHub 等公开源码的 HTTPS URL |
| `kind` | 固定为 `prompt-pack` |
| `entry` | 包内纯文本入口相对路径，禁止越界或符号链接 |
| `permissions` | 当前必须为空数组 `[]` |

字段完整示例见 [写作助手](../examples/writing-assistant/plugin.json)。扩展字段暂不接受，避免不同解释；需要新能力请提 Issue。格式校验的权威约束是 `schemas/plugin.schema.json`。

## 预期使用方式（待宿主实现）

用户明确选用后，将提示词作为可关闭的额外指导。具体提示词合并顺序、与角色卡冲突时的优先级、上下文占用展示还需随宿主设计确定。不能假设能读取聊天记录、修改角色卡、调用工具或向外部服务器发送内容。

示例只是原创提示词文本，不会被本仓库的工具执行、注入聊天或自动上传。不要在提示词中要求泄露密钥或绕过用户确认。
