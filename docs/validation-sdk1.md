# SDK 1.0 验证

[0.2.38+42 已发布](https://github.com/skyjjgw/skivu/releases/tag/v0.2.38-build.42)，完整源码包与 SHA-256 随 Release 提供，应用内更新已启用。[发布与验证摘要](releases/sdk-1.0.json)记录固定提交、包大小与摘要。最终发布 APK 实际打开服务器目录，显示 1 个项目、0 个已安装；业务插件未编入 APK。12 项新旧版本更新/下载检查通过，旧更新项保留。

宿主实现与原始验证记录固定于 [App 提交 46290b6](https://github.com/skyjjgw/skivu/tree/46290b6b293737b243ec4e94933466ddef8a5c8a)，见 [完整记录和设备截图](https://github.com/skyjjgw/skivu/blob/46290b6b293737b243ec4e94933466ddef8a5c8a/docs/OPEN-PLUGIN-VALIDATION.md)。

392 项 Flutter 回归、5 项 JS SDK 测试和插件仓库 16 项检查通过。Android API36 独立 QA 包实际验证了本地导入、自定义页面、ES modules、可靠存档、系统文件导入导出、聊天动作和整个聊天界面替换。设备隔离探针 11/11 通过，涵盖 6MiB 存档、宿主服务器拒绝和自有辅助服务无宿主身份访问。

未进行实体手机验收，未使用设备上的真实账号或收费模型；SDK 验证不替代每个实际插件自己的功能验收。测试探针不收录用户目录。主包仅包含通用宿主/SDK，实际插件由服务器目录和下载分发。
