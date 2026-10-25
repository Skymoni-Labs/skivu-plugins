# 开放插件 SDK 1.0

Skivu 的独立 Web 插件使用 HTML/CSS/JavaScript、ES modules、Canvas、WebAssembly 和自带资源编写界面与业务。每个插件一个隔离页面，通过异步 `Skivu.call(method, params)` 调用宿主。宿主不按第三方插件 ID 或界面模板设置白名单。服务器只分发目录与下载包，插件不内置进 APK。

## 包结构

开发目录为 `manifest.json`、`LICENSE` 和资源文件。打包工具输出 `.skivu.json`：

```json
{
  "manifest": {
    "schemaVersion": 1,
    "apiVersion": "1.0",
    "id": "org.example.my-plugin",
    "name": "我的插件",
    "version": "1.0.0",
    "minHostVersion": "0.2.38",
    "author": "Your name",
    "description": "实际提供的功能",
    "license": "MIT",
    "source": "https://github.com/example/my-plugin",
    "entry": "index.html",
    "permissions": ["storage"],
    "networkDomains": [],
    "contributes": {"launcher": true, "chatActions": []}
  },
  "files": {"index.html": {"mime": "text/html", "base64": "..."}},
  "licenseText": "完整许可证原文",
  "notices": "来源、作者和修改说明"
}
```

资源路径须为包内相对路径。`skivu-sdk.js` 由宿主提供，HTML 中可用 `<script src="/skivu-sdk.js"></script>`。第三方库应打入包内；运行页不直接加载外部脚本或页面。所有外部通信走 SDK，可审计权限，不能共享 App 的 Cookie、令牌或模型密钥。

`contributes.chatActions` 为最多 20 个 `{ "id": "action-id", "title": "动作名称" }`。从聊天入口打开时 `context.get` 的 `action` 返回该 ID。`launcher` 表示独立页面入口。可选 `chatSurface: true` 允许用户把该插件设为整个聊天界面；宿主仍保留导航与退出控制，停用后回到原聊天界面。无需新增固定 renderer 或修改 App 中的第三方 ID 清单。

## API 约定

所有调用返回 Promise，失败为带 `code` 的 Error。参数与返回值均为 JSON。没有任何 API 返回宿主配置、服务器 URL、请求签名、后台路由、账号令牌或模型密钥。`host.info` 返回 SDK 版本、已实现方法和权限名，用于能力探测；不能据此绕过声明或用户授权。

| 方法 | 权限 | 参数 / 返回 |
|---|---|---|
| `host.info` | 无 | `{apiVersion, platform, methods, permissions}` |
| `context.get` | 无 | 用户在宿主选择的 `{roleId, roleName, chatId, action}`，不含角色私密设定或聊天正文 |
| `storage.get` | storage | `{key}` → JSON 值或 null |
| `storage.set` | storage | `{key,value}` → true；原子持久化；单值最多 10 MiB、每插件存储最多 64 MiB |
| `storage.remove` / `storage.keys` | storage | `{key}` / `{}`；仅自己的空间 |
| `secrets.get/set/remove` | secrets | `{key,value?}`；仅插件自己的安全存储，禁止访问宿主密钥 |
| `fs.read/write/list/remove` | files | `{path,base64?}`；插件自己的相对路径工作区，读返回 `{base64}`，list 返回路径；禁止绝对路径和目录穿越 |
| `files.pick` | files | `{}` → 用户通过系统选择的 `{name,mime,base64}` 或 null |
| `files.save` | files | `{name,mime,base64}` → 用户选择保存位置后返回 boolean |
| `https.request` | network | `{url,method?,headers?,body?,bodyBase64?,responseType?}` → `{status,headers,body?,base64?,mime}`；只向声明域名发送自己的数据 |
| `network.request` | network | `https.request` 的通用别名；另获 `network.local` 权限后也支持用户自己的 HTTP/本机/局域网服务 |
| `characters.list/get` | characters.read | `{}` / `{roleId}` → 角色资料，不含宿主或服务器配置 |
| `characters.update` | characters.write | `{roleId,name?,subtitle?,prompt?,card?}`，修改前显示宿主确认 |
| `chat.read` | chat.read | `{limit?}` → 当前用户选定聊天的文本消息（最多 100 条），不含账号/模型配置 |
| `chat.append` | chat.write | `{role:"user"或"assistant",text}` → 当前聊天写入文本，显示宿主确认；不触发模型 |
| `ai.generate` | ai.generate | `{roleId?,instruction,context?,maxOutput?}` → `{text,usage}`；每次调用由用户确认，宿主沿用当前模型、账号/内测鉴权与计费保护 |
| `prompt.set` | prompt | `{text}` → 当前角色的本插件提示词贡献；仅用户启用的插件生效，可设空文本撤回 |
| `clipboard.read/write` | clipboard | `{}` / `{text}` → 文本 / true |
| `ui.toast` | 无 | `{text}` → true |
| `ui.openExternal` | external.open | **宿主0.2.39起**：`{url}` → `{status:"accepted"或"cancelled"或"not_available"}`；每次由宿主确认，再交系统浏览器或关联软件 |

`https.request` 支持标准 HTTP 方法、自定义端口和插件自有 Authorization/Cookie 头，不附加宿主的任何认证信息；不跟随重定向。`networkDomains` 支持精确域名、`*.example.com` 和 `*`（所有公开 HTTPS 站点）。只有声明 `network` 与 `network.local`、并得到用户授权后，才能连接用户自己的 HTTP/本机/局域网服务；可用独立的 Termux/电脑/自托管服务提供 Python、Node、stdio MCP 等能力。Skymoni 自有服务器、解析到宿主服务器的地址、云元数据和链路本地地址始终不对插件开放。解析后的连接地址固定，保留 HTTPS 证书与主机名验证，阻止重新解析与跳转越过边界。单次响应/文件 8 MiB。需要第三方账户的插件使用自己的 secrets 空间。App 不执行任意本机 shell、反射或任意 MethodChannel。

## 生命周期与授权

安装不会运行。用户启用时逐项确认声明权限；修改安装包后授权失效，须重新同意。关闭/卸载会停止页面和未完成的请求，不再贡献提示词。默认卸载保留插件数据，用户可单独清除；安全存储也只能由同一插件 ID 访问，清除数据同时清除自己的密钥。

SDK 使用 `Skivu.on("context.changed", callback)`、`Skivu.on("host.suspend", callback)` 订阅上下文变化和页面离开通知。离开通知仅用于尽力刷新 UI；可靠存档必须等待 `storage.set` 成功后再显示保存完成，不能依赖 unload。角色被删除后，该 roleId 的宿主操作返回 `NOT_FOUND`，`context.changed` 会更新当前选择。

## 开放发布

开发者可以从本地 `.skivu.json` 导入，也可添加自己的 HTTPS 目录；无需先成为官方收录作者。官方目录与第三方目录均提供固定下载 URL、SHA-256 和精确字节数。更新进行完整性校验、保留旧包、重置授权。包/目录/SDK 均在 GitHub；服务端运维配置和私有凭据不属于插件项目。

开放 API 只表示插件可请求这些能力。敏感动作仍由宿主显示真实确认，插件不能用声明自行授权，不能冒充宿主系统权限窗口。

## 公开链接与外部软件

`ui.openExternal` 是 SDK 1.0 的增量能力，需声明 `external.open` 并通过 `host.info.methods` 探测。依赖此能力的包设置 `minHostVersion: "0.2.39"`。仅接受一个公开 HTTPS `url`，拒绝账号信息、片段、脚本、file、data 和任意 intent。打开前与确认后均检查 DNS，拒绝私网、环回、链路本地、元数据和宿主服务器目标；同时支持公开 IPv4/IPv6 解析检查。不会附带宿主认证信息，不读取外部软件 Cookie 或登录状态。

`accepted` 仅表示系统接受了打开请求，不能据此声称已登录、发送、支付、下单或播放。`cancelled` 表示用户取消，`not_available` 表示系统无对应处理能力。系统浏览器/关联软件独立处理后续导航、重定向、DNS和其自身账号；插件网络代理的地址固定机制不延伸到外部软件。没有新增插件 ID、renderer 或第三方包名白名单。

## 目录向前兼容

0.2.40起使用官方 `https://skymoni.com/app-plugins/catalog/apps-v2.json`，自动迁移此前官方地址，保留用户第三方目录。GitHub备用路径为 `catalog/apps-v2.json`。旧 `apps.json` 及其GitHub备用内容继续提供初版宿主可解析的条目，不加入其不认识的权限。新版逐条隔离未来/异常条目，展示兼容提示，其他有效插件继续可用。两个目录都保持协议3.0并校验固定提交、完整manifest、SHA-256与大小；没有更改既有下载地址或逐插件ID特判。
