# 社区目录

`catalog/index.json` 是机器可读的**预览目录**，不是 App 安装源。

```json
{
  "schemaVersion": 1,
  "protocolVersion": "0.1-draft",
  "runtimeReady": false,
  "plugins": []
}
```

新增 `plugins` 条目结构如下；占位提交必须替换为真实、可查看的固定提交：

```json
{
  "id": "author.example",
  "name": "示例名称",
  "version": "0.1.0",
  "author": "作者",
  "license": "GPL-3.0-only",
  "permissions": [],
  "status": "preview",
  "source": {
    "repository": "https://github.com/author/example",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "packagePath": "."
  }
}
```

`packagePath` 是该提交内包含 `plugin.json` 的目录，根目录为 `.`。它必须是普通相对路径，不能包含 `..`、反斜杠或 URL。`commit` 固定到 40 位十六进制提交，不使用可变分支引用。

自动检查格式、重复 ID、本地示例和模板。**CI 不下载投稿仓库，不运行投稿脚本**。维护者在收录前需单独查看固定提交，确认包清单与条目的 ID、版本、作者、许可、权限一致，入口实际存在且为文本，来源声明完整。

此阶段不接受安装包 URL，也不下载或更新插件。宿主接入时另行增加包摘要、签名或来源验证、版本兼容和安装确认；不能直接把预览目录当成可信执行源。
