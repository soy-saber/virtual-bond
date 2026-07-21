# 开发问题与解决记录

本文记录 Virtual Bond 自 2026-07-19 起开发过程中实际遇到的问题、原因、解决方法和验证方式，便于后续开发与环境恢复。

安全约定：日志、测试输出和本文档均不得包含 API Key、访问令牌或完整的 CCSwitch `settings_config`。诊断时只输出字段名、配置类型和密钥是否存在。

## 1. `better-sqlite3` 的 Node ABI 不匹配

### 现象

直接使用系统 Node.js 读取 SQLite 时出现：

```text
The module was compiled against a different Node.js version
NODE_MODULE_VERSION 140
This version of Node.js requires NODE_MODULE_VERSION 137
```

### 原因

`electron-builder install-app-deps` 已将 `better-sqlite3` 重建为 Electron 39 使用的 ABI 140，而本机系统 Node.js 24 使用 ABI 137。同一份原生模块不能同时被这两个 ABI 加载。

### 解决方案

- 应用运行和涉及 `better-sqlite3` 的测试使用 Electron 自带的 Node 运行时。
- 不要为了让系统 Node 临时加载模块而反复执行普通 `npm rebuild better-sqlite3`，否则可能破坏 Electron 运行环境。
- 安装依赖后执行项目的 postinstall 重建：

```powershell
npm run postinstall
```

- 自动化测试由 [`scripts/run-tests.mjs`](../scripts/run-tests.mjs) 设置 `ELECTRON_RUN_AS_NODE=1`，再调用 Electron 执行 Node Test Runner。

### 验证

```powershell
npm test
```

数据库迁移和消息状态测试应全部通过。

## 2. Electron 包存在但缺少 `electron.exe`

### 现象

- `node_modules/electron` 存在，但没有 `path.txt`。
- `node_modules/electron/dist` 里只有不完整的语言包。
- `require('electron')` 报告 Electron 安装不完整，无法启动桌面应用。

### 原因

Electron 二进制下载或解压曾中断。在本次环境中，系统 Node.js 24 直接运行 Electron 的 `install.js` 还出现了异步下载完成但安装脚本未完成解压的情况。

### 首选解决方案

使用 Node.js 22 LTS，并通过镜像进行干净安装：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm ci
```

验证二进制：

```powershell
Test-Path .\node_modules\electron\dist\electron.exe
& .\node_modules\electron\dist\electron.exe --version
```

### 本次使用的应急修复

当 npm 包已经安装，但只有二进制缺失时，使用 `@electron/get` 获取与依赖版本一致的压缩包，再用 Windows 自带的 `tar` 解压：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$electronZip = @'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { downloadArtifact } = require('@electron/get')
const { version } = require('./node_modules/electron/package.json')
const checksums = require('./node_modules/electron/checksums.json')
const path = await downloadArtifact({
  version,
  artifactName: 'electron',
  platform: 'win32',
  arch: 'x64',
  checksums,
  force: true
})
console.log(path)
'@ | node --input-type=module -

tar -xf $electronZip.Trim() -C .\node_modules\electron\dist
Set-Content -LiteralPath .\node_modules\electron\path.txt `
  -Value 'electron.exe' -NoNewline -Encoding ascii
```

`path.txt` 必须使用 `-NoNewline`；否则路径末尾的换行会导致 `spawnSync ... ENOENT`。

### 补充问题

PowerShell `Expand-Archive` 在本次环境中解压 Electron 时出现 DLL 访问被拒绝和部分文件清理异常，改用 `tar -xf` 后成功。

## 3. 项目路径包含空格

### 现象

项目位于 `D:\github repo\virtual-bond`，某些原生模块命令、脚本和手工路径拼接容易把路径截断。

### 解决方案

- PowerShell 文件操作优先使用 `-LiteralPath`。
- 执行命令时设置明确的工作目录，避免手工拼接未加引号的完整路径。
- Node 代码使用 `path.join` / `path.resolve`。
- 启动子进程时直接传递参数数组，不拼接整条命令字符串。

## 4. CCSwitch 同时存在三套“当前配置”

### 现象

CCSwitch 的 `settings.json` 同时记录：

- `currentProviderClaude`
- `currentProviderCodex`
- `currentProviderGemini`

使用 SQL `WHERE id IN (...)` 查询时，SQLite 不保证返回顺序。本次脱敏检查中实际返回顺序为 Gemini、Codex、Claude，原逻辑会错误导入第一条 Gemini 配置。

### 解决方案

- 导入接口增加 `preferredProvider`。
- OpenAI 或自定义兼容配置优先选择 CCSwitch 的 Codex 项。
- Anthropic 优先 Claude，Gemini 优先 Gemini。
- 首次自动导入根据 Virtual Bond 当前选择的 Provider 定向选择，而不是依赖 SQL 返回顺序。

相关实现：[`src/main/provider-settings.ts`](../src/main/provider-settings.ts)。

## 5. 不同 CCSwitch Provider 的配置结构不同

### 现象

CCSwitch 的 `settings_config` 并非统一格式：

- Codex：密钥位于 `auth.OPENAI_API_KEY`，地址、模型和 `wire_api` 位于 TOML 字符串 `config`。
- Claude：地址和密钥主要位于 `env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_AUTH_TOKEN`。
- Gemini：地址、模型和密钥位于 `env.GOOGLE_GEMINI_BASE_URL`、`env.GEMINI_MODEL`、`env.GEMINI_API_KEY`。

### 解决方案

- 按 `app_type` 分别解析 Claude、Codex 和 Gemini。
- Codex TOML 同时识别 `base_url`、`api_base`、`model` 和 `default_model`。
- 支持三种导入入口：CCSwitch 数据库、`ccswitch://` 分享链接和复制的 JSON。
- 诊断代码只打印配置字段名与 `has_any_key`，不输出字段值。

## 6. OpenAI Responses 与自定义兼容 API 协议不同

### 现象

官方 OpenAI 推荐 Responses API，但很多第三方中转服务只兼容 `/chat/completions`。如果所有 Provider 强制使用同一协议，会导致部分自定义 API 无法调用。

### 解决方案

- `openai` 使用 Responses API，并监听 `response.output_text.delta`。
- `custom` 使用 OpenAI Chat Completions 流式协议。
- `anthropic` 使用 Messages API。
- `gemini` 使用 `streamGenerateContent` SSE。

实现位于 [`src/main/chat-provider.ts`](../src/main/chat-provider.ts)。

参考：

- [OpenAI 最新模型指南](https://developers.openai.com/api/docs/guides/latest-model.md)
- [OpenAI 流式响应指南](https://developers.openai.com/api/docs/guides/streaming-responses.md)

## 7. API Key 的安全存储回退不安全

### 现象

早期实现计划在 `safeStorage` 不可用时，将 Key 以 `plain:` + Base64 的形式写入 SQLite。Base64 只是编码，不是加密，与“不以明文存储密钥”的目标冲突。

### 解决方案

- 非空 Key 只允许通过 Electron `safeStorage.encryptString()` 保存。
- 系统加密服务不可用时明确报错，不再静默降级为 Base64。
- 如果发现历史 `plain:` 数据且当前安全存储可用，读取后自动重新加密。
- 设置查询和导出只返回 `apiKeyPresent` 与末四位提示，不返回 Key 本身。

## 8. 流式 IPC 不能只依赖 `invoke` 返回值

### 现象

`ipcRenderer.invoke()` 只会在主进程处理完成后返回一次结果，无法持续传递模型文本增量，也无法及时停止生成。

### 解决方案

- `conversation:send` 负责请求生命周期和最终结果。
- 主进程通过 `conversation:stream-delta` 持续发送增量。
- 每个请求使用独立 `requestId` 和 `AbortController`。
- `conversation:stop` 只允许停止同一个渲染进程创建的请求。
- preload 返回监听器清理函数，Vue 组件卸载时移除监听器。

## 9. 自动重试可能造成重复文本

### 现象

流式请求若已经输出部分文本后重新发送整个请求，第二次响应可能重复已有内容。

### 解决方案

仅在以下条件同时满足时重试：

- 尚未收到任何文本增量。
- 请求没有被用户停止。
- 错误属于限流、超时、网络连接或服务端错误。
- 尚未达到最多三次尝试。

一旦收到首个文本增量，后续错误直接记录为失败，不自动重放请求。

## 10. 生成中断会留下无法识别的半成品消息

### 现象

如果应用在模型生成期间崩溃，仅在内存保存回复会导致数据库无法判断这次回复是成功、停止还是异常中断。

### 解决方案

- 数据库迁移增加消息状态：`sending`、`completed`、`stopped`、`failed`。
- 请求开始前创建 `sending` 的伙伴消息。
- 完成、停止或失败时更新同一条消息。
- 应用启动时将残留的 `sending` 自动恢复为 `failed`，并写入可读错误提示。
- 失败消息不会再次进入模型上下文；主动停止且已有内容的回复可以保留为历史上下文。

## 11. 旧数据库已有迁移表，但没有迁移执行器

### 现象

旧库包含 `schema_migrations`，但没有实际执行和记录版本的逻辑，直接修改建表 SQL无法升级已经存在的数据库。

### 解决方案

- 引入按版本执行的迁移列表。
- 每个迁移在 SQLite 事务中执行并写入版本号。
- 使用 `PRAGMA table_info` 判断旧列是否存在，避免重复 `ALTER TABLE`。
- 为旧消息补齐 `status = completed` 和 `updated_at = created_at`。
- 数据层拆分为可测试的 [`database-core.ts`](../src/main/database-core.ts)。

### 数据安全措施

首次对真实旧库运行迁移前，同时备份 `.db`、`.db-wal` 和 `.db-shm`，不能只复制主数据库文件。

本轮迁移前备份位置：

```text
%APPDATA%\Electron\backups\virtual-bond-before-v2-20260719-064920
```

## 12. CRLF 导致数百条 Prettier 警告

### 现象

Windows 检出的旧文件使用 CRLF，而 Prettier/ESLint 按 LF 校验，Lint 一度产生 900 多条仅与换行符有关的警告，掩盖真正的代码问题。

### 解决方案

- 新增 `.gitattributes`，新检出文本统一为 LF。
- Prettier 设置 `endOfLine: auto`，兼容工作区已有文件。
- ESLint 的 `prettier/prettier` 规则同步设置 `endOfLine: auto`。
- 修改配置后使用 `npx eslint --no-cache .` 排除旧缓存影响。
- 只格式化本次修改文件，避免无意义地重写整个仓库。

## 13. OpenAI 官方文档 MCP 在当前会话中不可用

### 现象

开发需要核对最新 Responses API 和模型指南，但当前 Codex 会话没有配置 OpenAI Developer Docs MCP。

### 解决方案

```powershell
codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp
```

MCP 配置需要重启 Codex 后加载。本次会话在安装后，临时通过 `developers.openai.com` 官方 Markdown 页面完成核对，没有使用非官方来源。

## 14. 验证基线

每次修改 Provider、IPC 或数据库逻辑后运行：

```powershell
npm run check
```

该命令依次执行：

1. Node 与 Vue 类型检查
2. 数据库迁移和恢复测试
3. ESLint
4. Electron 生产构建

涉及 Electron 启动逻辑时，再进行短时间启动冒烟测试，确认进程持续运行且标准错误为空。实际模型连通测试可能产生 API 费用，应由用户明确触发，不应在普通构建验证中自动发送请求。

## 15. Codex 中转的 Responses 请求不一定等同于通用 OpenAI Responses

### 现象

CCSwitch 当前 Codex 配置可由 Codex CLI 正常调用，但 Virtual Bond 使用 OpenAI SDK 的通用 Responses 请求时，中转服务返回 `400 invalid codex request`。

### 原因与处理

- 已确认地址、网络、模型和凭据均有效，失败发生在协议兼容层。
- 该中转可能校验 Codex CLI 专用请求头或额外请求体字段，不能仅凭字段名称猜测后直接应用到所有 OpenAI Provider。
- 当前保留标准 OpenAI Responses 实现；需要兼容此类 Codex 专用中转时，应增加独立协议选项，并通过脱敏代理捕获请求结构后再实现。
- 自定义 OpenAI-compatible 服务继续使用 `/chat/completions`，避免受 Codex Responses 私有约束影响。

安全提醒：诊断命令不得输出 Authorization、提示正文或 CCSwitch 中的认证字段值。如果凭据曾进入终端或会话输出，应立即轮换。

## 16. 使用本机 DeepSeek Key 进行真实链路验证

### 约定

本地测试凭据位于用户指定的仓库外部 Key 文件。它只允许在临时测试程序运行时读取：

- 不复制进项目目录。
- 不写入源码、文档、测试快照或 Git 历史。
- 不打印 Key、末尾字符或模型回复正文。
- 测试使用隔离的临时 Electron `userData` 目录，结束后删除测试数据库。

### 2026-07-19 实机结果

通过 `custom` Provider 调用 DeepSeek 的 OpenAI-compatible Chat Completions 流式接口，验证了安全存储、真实网络请求、流式增量和 SQLite 状态更新。结果为 4 个文本增量，回复非空，最终消息状态为 `completed`。

## 17. Windows 显示缩放导致桌宠拖动反馈和尺寸漂移

### 现象

连续拖动桌宠后，透明窗口的可拖动区域看起来越来越大，桌宠与底部按钮的距离也随之增加。

### 原因与解决方案

- 渲染层 PointerEvent 的 `screenX/screenY` 与 Electron 原生窗口位置在 Windows DPI 缩放下可能使用不同坐标尺度，持续移动会产生反馈偏差。
- 拖动坐标改为由主进程通过 `screen.getCursorScreenPoint()` 统一读取。
- 桌宠模式的最小尺寸和最大尺寸都锁定为 `360 × 440`，每次移动也显式保持该尺寸。
- 进入房间模式时恢复可调整尺寸和房间窗口上限。

## 18. 本地普通对话误用 CCSwitch Codex 中转

### 现象

真实对话返回 `400 invalid codex request`，说明应用仍在使用此前自动导入的 Codex Responses 配置。

### 解决方案

- 当本机桌面存在 `key/key.txt`，且当前配置仍是默认配置、本地 DeepSeek 配置或自动导入的 CCSwitch Codex 配置时，普通聊天自动切换为 DeepSeek 直连。
- 使用 `https://api.deepseek.com/v1`、`deepseek-chat` 和自定义 Chat Completions 流式协议。
- Key 读取后通过 Electron `safeStorage` 保存，不进入源码和 Git。
- 用户手动保存的其他 Provider 不会被该本地默认规则覆盖。
- Agent 工具调用不复用普通聊天 Provider，后续通过 OpenCode CLI 单独实现。

## 19. 关闭陪伴空间后状态没有回到桌宠

### 现象

陪伴空间的关闭按钮只隐藏窗口。再次显示时，渲染层仍停留在房间状态，可能出现完整界面被压入桌宠尺寸窗口、按钮覆盖角色等错位。

### 解决方案

- 房间状态下点击应用关闭按钮或触发原生窗口关闭时，不再直接隐藏。
- 主进程先恢复桌宠窗口尺寸和缩放，再通知渲染层切换回桌宠视图。
- 桌宠状态下关闭窗口仍然隐藏到托盘；彻底退出继续通过桌宠右键菜单或托盘菜单执行。
- 同时上移角色主体并下移底部操作栏，给序列帧角色预留更清晰的交互间距。

## 20. Electron IPC 字节数据不能直接作为浏览器 BlobPart

### 现象

主进程通过 IPC 返回 PNG 的 `Uint8Array` 后，运行时可以传输，但 TypeScript 将其底层缓冲区视为可能包含 `SharedArrayBuffer` 的 `ArrayBufferLike`，不能直接交给浏览器 `Blob` 构造器。

### 解决方案

- 渲染层先使用 `new Uint8Array(asset.bytes)` 复制 IPC 数据，取得普通 `ArrayBuffer` 后再创建临时 Blob URL。
- PixiJS 只加载该临时 URL，主进程仍按已扫描的皮肤 ID 和动作名控制磁盘访问。
- 动作切换和组件卸载时撤销旧 Blob URL，避免长时间运行产生资源泄漏。

## 21. 图片 Key 文件包含多行内容

### 现象

桌面 `key.txt` 不只是单行凭据。如果直接使用 `readFileSync(...).trim()`，会把后续说明或其他内容一并放入 Bearer Token，导致鉴权失败或意外泄露无关内容。

### 解决方案

- 按桌面 API 文档约定，只读取 `key.txt` 第一行并去除首尾空白。
- 图片 Key 使用独立的 `image.provider.secret` 设置项，通过 Electron `safeStorage` 加密。
- 验证过程只输出成功状态和模型列表，不输出 Key、Key 片段或请求头。

## 22. GPT Image 2 最小面积与播放器 Sheet 尺寸不同

### 现象

播放器需要 `1024 × 512` 的八帧 Sheet，但标准 GPT Image 2 工具要求生成图片至少包含 655360 像素，无法直接请求该尺寸。

### 解决方案

- 请求 `1280 × 512`：保持 `4 × 2` 网格，每格为 `320 × 256`。
- Prompt 要求角色限制在每格中央 `256 × 256` 安全区，左右各留 32 像素纯背景。
- 移除色键后逐格裁切中央区域并重新拼接，得到精确的 `1024 × 512` 透明 PNG。

## 23. PixiJS 在 Electron 严格 CSP 下初始化失败

### 现象

皮肤清单和 PNG 校验均通过，但桌宠仍显示 CSS 占位角色。渲染日志提示 `Current environment does not allow unsafe-eval`。

### 原因与解决方案

- PixiJS 8 默认会检测着色器和 Uniform 同步所需的动态函数能力，Electron 页面当前 CSP 不允许 `unsafe-eval`。
- 在任何 PixiJS Renderer 初始化之前导入官方的 `pixi.js/unsafe-eval` 兼容模块。
- 该模块名称容易误解：它不是放宽 CSP 或开启 `eval`，而是安装静态同步实现，从而移除对 `eval` / `new Function` 的依赖。
- PixiJS 图片解码器会通过 Fetch 读取本地 PNG Blob，并创建解码 Worker，因此 CSP 额外明确允许 `img-src blob:`、`connect-src data: blob:` 与 `worker-src blob:`，但仍不允许脚本 `unsafe-eval`。
- 开发模式将渲染进程 console 转发到主进程日志，方便区分素材校验、IPC 和 GPU 初始化错误。

## 24. 双击进入空间时先看到放大的桌宠

### 现象

双击桌宠后 Electron 窗口已经切换为房间尺寸，但 Vue 仍短暂或持续显示桌宠页面，视觉上像角色突然被放大。

### 解决方案

- 当前由主进程先解除桌宠尺寸约束并设置房间边界，IPC 完成后渲染层再挂载房间页面。
- 模式切换仍在同一次异步交互中完成；如果 IPC 调用失败，渲染层保持桌宠页面并记录错误。
- 房间角色布局由 `ResizeObserver` 跟随实际舞台尺寸更新，不依赖切换前的桌宠画布尺寸。

## 25. AI 生成的待机动画看起来持续向左平移

### 现象

Sprite Sheet 的网格和图片尺寸正确，但八帧角色中心从约 `149.5` 像素逐步移动到 `91` 像素。循环播放时不像呼吸，而像角色不断从右向左滑动。

### 解决方案

- 透明化后分别读取每帧 Alpha 通道的非透明包围盒。
- 将每帧包围盒水平中心统一到 `x=128`，脚底统一到 `y=244`，再拼回规则网格。
- 图片模型 Prompt 仍保留固定锚点要求，但程序不能假设生成模型一定遵守，需要将自动对齐作为正式素材管线的一部分。
- 对齐只消除整体位移，不修正肢体形变；动作质量仍需人工实机验收。

## 26. 陪伴空间仍显示旧的 CSS 剪影

### 现象

桌宠已经切换为新皮肤，但进入陪伴空间后舞台中央仍是原型期的 CSS 角色轮廓，角色身份不一致。

### 解决方案

- 将 PixiJS 播放器改为可配置画布尺寸、角色显示尺寸和脚底坐标的通用组件。
- 桌宠与陪伴空间加载同一皮肤和同一 `idle` 动作，只在布局参数上有所区别。
- 皮肤不可用时，桌宠回退 CSS 桌宠，陪伴空间回退原 CSS 剪影，保证界面仍可使用。

## 27. 三参考图高质量请求被路由拒绝

### 现象

使用三张参考图请求 `2048 × 1024`、`quality=high` 时返回 `400`，提示当前路由没有启用对应 2K Provider；同一通道的 `1024 × 1536 high` 请求可以成功。

### 解决方案

- 不把单个失败组合泛化为整个通道不支持高分辨率，尺寸、质量和参考图数量需要分别实测。
- 后续已确认文生图 `3840 × 2160 low`、单参考图 `3840 × 2160 low` 和单参考图 `2160 × 3840 high` 均能返回原生尺寸。
- 八帧 Sheet 改用已兼容的 `1536 × 1024 high`，对应 `4 × 2`、单格 `384 × 512`。
- 后处理时保持角色纵横比，将每格等比缩放并居中到 `256 × 256` 透明帧，避免直接拉伸。
- 保留服务端错误但不记录请求头、Key 或参考图内容。

## 28. 待机呼吸导致全身都在变化

### 现象

图片模型为每帧重新绘制角色，即使整体锚点已经对齐，腿、鞋、手臂、衣摆和五官仍会产生细小变化，播放时看起来像全身抖动而不是呼吸。

### 解决方案

- 待机动画不再直接使用八张独立重绘帧，而以同一张高质量标准角色图作为所有帧的像素来源。
- 从同一张 4K 母版重建所有帧，骨盆、腰部以下和脚底保持锚定，胸肩承担主要形变。最初收敛到 2 像素后在默认桌宠尺寸下不足 1 个屏幕像素，实机几乎不可见，因此调整为源帧最大约 5 像素；头颈再以 25% 幅度滞后约 0.75 帧跟随。
- 8 帧播放速度由 `6 FPS` 降到 `2 FPS`，周期从约 `1.33` 秒调整为约 `4` 秒，对应每分钟约 `15` 次，落在成人静息呼吸常见范围内。
- 自动校验每帧锁定区域与第一帧完全一致，避免脚底、腿部和地面接触点变化。
- 行走、挥手等确实需要全身或肢体变化的动作仍使用独立帧，但必须按动作语义定义锁定区域。

## 29. 256 像素帧在陪伴空间中放大后模糊

### 现象

桌宠窗口较小时 `256 × 256` 帧尚可接受，但陪伴空间将同一角色放大到约 360 像素后会发生纹理上采样，线稿和五官明显发虚。

### 解决方案

- 测试皮肤升级为每帧 `1024 × 1024`、整张 `4096 × 2048` 的高分辨率 Sheet。
- 皮肤画布、脚底锚点和点击区域按四倍坐标同步更新，播放器仍按目标显示尺寸缩小渲染。
- 文档规定 1K 模板到最高 4K 主素材的分阶段流程；只有 Provider 实际返回 `3840 × 2160` 或 `2160 × 3840` 等目标尺寸时才标记为原生 4K，普通插值仍不能冒充生图优化。

## 30. 角色放大后出现彩色锯齿边

### 现象

角色在较小尺寸下基本正常，调大后头发、外套和鞋子外沿出现绿色或彩色锯齿，脸部细节也因为桌宠尺寸上限较低而难以看清。

### 原因与解决方案

- 色键去底后的少量绿色污染保留在半透明和临界不透明像素中，放大后比普通锯齿更明显。
- 本地后处理只清理透明边界附近的绿色分量，不重新生成或重绘角色；待机锁定区域仍需逐帧像素一致。
- PixiJS 画布使用自适应 3×–4× 内部渲染分辨率，并为高分辨率 Sheet 启用线性采样、自动 mipmap 和像素对齐，减少缩放采样闪烁。
- 桌宠尺寸上限由 `120%` 提高到 `180%`，窗口、气泡、点击区域和拖拽区域继续使用同一个缩放因子。

## 31. 呼吸时胸腰腹在动但头部完全静止

### 现象

胸肩和腹部已经能看见轻微呼吸，但头部像被固定在画布上一样完全不响应，使颈部连接显得僵硬。

### 原因与解决方案

- 前一轮为了消除全身上下起伏，把头顶区域硬锁定；头颈剩余位移缩放后低于 0.2 逻辑像素，视觉上等同静止。
- 安静呼吸的主要运动仍来自胸廓、膈肌和腹部，但研究显示呼吸会沿姿态链影响肩部、颈椎和头部；基于头部微运动也可以估计呼吸频率，因此严格锁头并不自然。
- 骨盆、腿脚继续逐帧锁定；胸肩使用主呼吸曲线，头颈使用其 25% 基础幅度并滞后约 0.75 帧，颈肩之间采用余弦权重平滑衔接。
- 实机发现 25% 只相当于 1.25 个源像素，缩放后约 0.31 逻辑像素，仍然无法稳定辨认；因此增加 3 个源像素的最小可见下限，桌宠画布中约为 0.75 逻辑像素。
- 25%、最小可见下限和 0.75 帧属于动画表现参数，不冒充医学研究给出的生理比例；相关生理依据见 `docs/image-generation.md` 的参考资料。

## 32. 调整头颈联动后只有下腹部明显运动

### 现象

头颈已经加入轻微跟随，但呼吸的主要可见形变落在腰带上方和下腹部，胸肩反而不明显。

### 原因与解决方案

- 原曲线在 `y=185–600` 之间使用对称正弦权重，数学峰值位于约 `y=393`；对当前角色构图而言，该位置接近腰部而不是胸廓。
- 将空间权重改成分段余弦曲线：从肩线快速上升，在约 `y=275` 的上胸区域达到峰值，再向 `y=500` 的腰部逐渐衰减。
- 头颈过渡区同步上移到 `y=150–255`，继续保留 25% 幅度和 0.75 帧滞后；`y>=500` 不再参与呼吸形变，骨盆与腿脚继续锁定。

## 33. 桌宠放大后透明区域遮挡工作区点击

### 现象

桌宠显示比例增大后，虽然人物只占窗口中间一小块，但整张透明窗口仍接收点击和拖拽，导致人物周围大片透明区域无法操作下面的应用。

### 原因与解决方案

- 透明 Electron 窗口默认仍会参与鼠标命中，CSS 透明不等于系统级点击穿透。
- 播放器将皮肤 `canvas.hitbox` 换算成当前画布中的人物包围盒，桌宠只允许从该区域开始拖拽。
- 底部操作按钮和关闭气泡按钮保留正常点击；其他透明区域通过 `setIgnoreMouseEvents(..., { forward: true })` 把鼠标交还给下层窗口。
- 拖拽开始后暂时关闭穿透，避免指针移动到人物包围盒外时丢失拖拽；返回陪伴空间或组件卸载时恢复整窗交互。

## 34. 默认问候气泡常驻且遮挡桌面

### 现象

桌宠启动后始终显示“晚上好，我在这里。”，即使角色没有正在说话也占用视觉空间；后续动态消息也没有按内容长度自动消失。

### 原因与解决方案

- 气泡初始状态改为隐藏，唤醒动作本身不再强制显示固定问候。
- 只有角色实际调用 `say` 时才显示气泡；显示时长按非空白字符数计算，当前为 `1200ms + 字符数 × 180ms`，并限制在 `2.4–9` 秒。
- 新消息会重置旧计时器，计时结束后使用 450ms 透明度与位移过渡淡出；手动关闭和组件卸载会同步清理计时器。

## 35. 皮肤扫描存在但播放器始终使用第一套资源

### 现象

主进程已经可以发现多套皮肤和报告损坏清单，但播放器每次挂载都直接选择扫描结果的第一项。用户无法预览或持久化选择，桌宠与陪伴空间也没有统一的切换通知；如果某个皮肤根目录本身无法读取，整个设置页还可能一起加载失败。

### 原因与解决方案

- 新增 SQLite 设置 `skin.activeId`，扫描后优先解析已保存 ID；旧选择被移除或损坏时回退到按名称排序后的第一套可用皮肤，并把恢复状态返回给界面。
- 设置页使用同一个 PixiJS 播放器显示 `idle` 预览，只有点击“使用此皮肤”才持久化选择，避免浏览列表时意外更换桌宠。
- 选择成功或重新扫描后通过渲染进程事件同步所有非预览播放器，桌宠和陪伴空间无需重新创建窗口即可切换。
- 用户目录入口、重新扫描按钮和无效皮肤列表形成完整闭环；错误项显示目录来源、目录名和具体原因。
- 根目录读取失败被转换为单独的无效项并继续扫描其他根目录，不再让一个目录阻断全部皮肤和模型设置加载。

## 36. 陪伴空间最大化后仍有透明留白且角色位置漂移

### 现象

陪伴空间普通窗口外围有一圈装饰间距，最大化后该间距仍然保留，看起来像应用内容外面还套着一个更大的透明界面。中间舞台会随窗口变宽，但角色仍停留在固定位置，尺寸也不会利用新增空间。

### 原因与解决方案

- `.room-shell` 原来固定使用 `10px` 外边距和圆角阴影；透明无边框窗口最大化后，这些装饰会直接暴露桌面背景。陪伴空间现在改为全窗口铺满，并覆盖 `.app-shell` 的边框、圆角和阴影。
- 角色播放器原来固定为 `600 × 712`，脚底固定在 `(350, 622)`，而舞台列宽由 CSS Grid 响应式计算，两套坐标不会同步。
- 角色场景现在使用 `ResizeObserver` 读取舞台宽高，动态计算播放器画布、角色尺寸和脚底坐标；角色优先落在文字右侧，并在底部快捷按钮上方保持统一地面线。
- PixiJS 播放器在布局变化时只调用渲染器 resize 并更新现有 Sprite 的缩放和位置，不重新解码 Sheet，避免拖动窗口时频繁加载图片。

## 37. 桌宠尺寸滑杆在 180% 提前结束

### 现象

高分辨率素材已经可以支持更近距离观察，但桌宠尺寸滑杆最后停在 `180%`，无法继续放大脸部和服装细节。

### 原因与解决方案

- 主进程归一化上限和设置页 range 的 `max` 都硬编码为 `1.8`，因此不是鼠标拖动失效，而是产品上限已经到达。
- 两处上限同步提高到 `2.4`，当前可调范围为 `45%–240%`；仍保持 `5%` 步长、底部锚定和窗口/角色/气泡/点击区域统一缩放。

## 38. 首次双击进入陪伴空间只显示人物上半身且看不到设置按钮

### 现象

桌宠首次切换到陪伴空间后，房间内容仍像被限制在较小窗口中，人物下半身和侧栏底部的设置按钮不可见；最大化后布局才恢复完整。

### 原因与解决方案

- 桌宠模式把窗口最小和最大尺寸都锁定为桌宠尺寸；进入房间时原先先把最小尺寸提高到 `920 × 640`，再解除较小的最大尺寸约束，Windows 首次扩窗可能继续受到旧上限影响。
- 房间默认高度固定为 `760`，会超过部分 768p 显示器扣除任务栏后的工作区高度，窗口即使成功扩展也可能有底部内容落在屏幕外。
- 切换顺序改为先解除最大尺寸限制，再设置房间最小尺寸；初始房间边界根据桌宠所在显示器的 `workArea` 收敛并居中，不再覆盖任务栏或越出屏幕。
- 渲染进程等待主进程完成窗口模式切换后再挂载房间界面，避免角色布局观察器先读取桌宠画布尺寸。
- 房间边界计算拆为纯函数并增加自动化测试，覆盖常规大屏、任务栏压缩后的 768p 工作区和带负坐标的小尺寸副屏。

## 39. 房间窗口尺寸正确但角色小腿和设置按钮仍在窗口外

### 现象

窗口已经是预期的房间尺寸，最大化也正常，但普通窗口中角色只显示到小腿附近，侧栏底部的“设置”按钮和舞台快捷操作不可见；聊天历史越长越容易出现。

### 原因与解决方案

- `.workspace` 是固定可用高度的 CSS Grid，但默认网格行使用内容最小尺寸；聊天消息的最小内容高度可以把整行撑得比容器更高。
- 同一网格行中的侧栏和舞台也会随之变高，所以 `margin-top: auto` 的设置按钮、角色脚底和快捷操作虽然位于各自面板底部，实际底部已经落到窗口外。
- 工作区显式使用 `minmax(0, 1fr)` 行，并为侧栏、舞台、聊天面板和消息列表设置 `min-height: 0`；网格保持在窗口可用高度内，只有消息列表内部滚动。

## 40. 首次进入房间时角色右半身和小腿被裁掉

### 现象

从桌宠双击进入陪伴空间时，房间窗口和其他界面元素尺寸正常，但角色只显示左上部分；调整窗口尺寸后可能恢复。

### 原因与解决方案

- 房间组件刚挂载时，播放器先使用默认 `600 × 712` 初始化 PixiJS；父组件随后通过 `ResizeObserver` 写入真实舞台尺寸。
- 如果 props 更新发生在异步 `app.init()` 完成之前，原有 watcher 因播放器尚未初始化而跳过 resize。角色位置随后使用新尺寸计算，但渲染器仍保留旧尺寸，于是右侧与底部被画布裁切。
- `app.init()` 完成后立即使用当前最新 props 再调用一次 `renderer.resize()`，补偿初始化期间发生的布局更新；后续尺寸变化仍由 watcher 实时同步。

## 41. 开发模式启动后 Electron 无法连接 5173

### 现象

运行 `npm run dev` 后 Electron 进程仍在，但窗口加载 `http://localhost:5173/` 时出现 `ERR_CONNECTION_REFUSED`；系统事件日志没有崩溃记录。

### 原因与解决方案

- 当前 Windows 环境中 Vite 默认监听 IPv6 回环地址 `::1`，而 Electron 加载 `localhost` 时没有成功连接到该监听地址。
- 在 `electron.vite.config.ts` 中将 renderer 开发服务器明确绑定到 `127.0.0.1`，启动后 IPv4 端口可正常返回 HTTP 200。
- 同时出现的 Electron CSP 警告来自加载失败后的开发错误页，不是连接失败的根因；生产构建仍使用项目定义的 CSP。

## 42. 桌宠缩放后操作按钮压住腿脚或过度放大

### 现象

桌宠缩小到 `45%` 时底部操作按钮与人物腿脚过近，放大到 `240%` 后按钮又随页面缩放成为巨型控件。

### 原因与解决方案

- 桌宠窗口通过 Electron 页面缩放同步调整角色和交互区域，原有按钮也被同一缩放因子放大或缩小。
- 操作按钮改用独立的受限视觉比例，最终显示范围约为 `72%–110%`，不再线性跟随角色尺寸。
- 按钮位置根据当前皮肤命中范围的底部计算，并保持约 `18px` 的屏幕间距；按钮命中检测继续使用变换后的实际 DOM 边界。

## 43. Q 版房间的行为逻辑难以在 PixiJS 组件内测试

### 现象

陪伴空间从 CSS「雨夜书房」改为 Q 版 PixiJS 场景后，行走区域、情境到锚点映射、到达后动作切换和对话打断优先级等逻辑如果直接写在 `RoomScene.vue` 里，会依赖 PixiJS `Application`、`Ticker` 和浏览器环境，无法在 Node Test Runner 中直接验证。

### 原因与解决方案

- 把房间行为抽离为纯 TypeScript 状态机 `src/renderer/src/room-state.ts`：只处理逻辑坐标、意图优先级、锁定时长与动作切换，不引用任何 PixiJS 或 DOM API。
- `RoomScene.vue` 只负责渲染和把 props（情境、对话状态、尺寸）转换为状态机请求，再按每帧快照更新显示对象。
- 状态机由 `tests/room-state.test.ts` 覆盖行走区域裁剪、情境锚点映射、到达后活动切换和对话打断优先级，共 5 项，可在 `npm test` 中直接运行，无需启动 Electron 或 PixiJS。

## 44. 桌宠大比例缩放后房间偏移且返回时残留房间画面

### 现象

- 桌宠设为 `240%` 后进入陪伴空间，内容整体横向偏移并被裁切。
- 切换尺寸后房间角色可能消失；返回桌宠时，小窗口只显示陪伴空间的一角。
- 渲染日志出现 `Cannot read properties of null (reading 'geometry')` 和 Vue 组件更新异常。

### 原因与解决方案

- 同一个 Electron 窗口原先通过 `webContents.setZoomFactor(petScale)` 缩放桌宠，进入房间时再恢复为 `1`。Chromium 可能保留此前视觉视口偏移，使房间根节点错位。
- 桌宠现在固定使用 `360 × 440` 逻辑画布，尺寸变化由 CSS `transform: scale(...)` 完成；Electron 页面缩放永久保持 `1`，房间与桌宠不再共享缩放状态。
- 返回桌宠时先让 Vue 卸载房间组件，再恢复原生窗口尺寸，避免把仍存在的房间页面裁入桌宠窗口。
- PixiJS 卸载不再调用递归深度销毁。先停止 ticker、移除回调、断开 observer、销毁精灵并清空 stage，最后销毁 renderer；异步 `Application.init()` 完成时若组件已卸载则立即安全释放。

### 验证

- 在 `45% / 100% / 240%` 下反复执行桌宠 → 陪伴空间 → 桌宠。
- 确认房间无偏移和裁切、角色持续可见、返回后恢复桌宠且日志没有 PixiJS/Vue 异常。

## 45. 返回桌宠或打开皮肤预览时短暂闪现降级内容

### 现象

- 从陪伴空间返回桌宠时，先短暂显示默认 CSS Q 版表情，随后才变成实体皮肤。
- 设置页打开或切换皮肤预览时，可能先闪现“无法预览”。

### 原因与解决方案

- 原实现使用单个布尔值表示皮肤是否可用，初始值 `false` 同时代表“尚在加载”和“已经失败”，导致异步资源加载完成前错误展示降级内容。
- 桌宠和设置页预览改用 `loading / ready / unavailable` 三态。加载期间保持透明，只有资源确认加载失败时才显示 CSS 降级角色或“无法预览”。
- 运行中更换皮肤时保留旧实体，直到新纹理和精灵创建完成，因此不会经过默认 Q 版中间态。

### 验证

- 用户实机确认返回桌宠不再闪现默认 Q 版角色。
- `npm run check` 通过 TypeScript、21/21 测试、ESLint 和 Electron 生产构建。
