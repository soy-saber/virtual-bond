# 开发问题与解决记录

本文记录 Virtual Bond 在 2026-07-19 开发过程中实际遇到的问题、原因、解决方法和验证方式，便于后续开发与环境恢复。

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

本地测试凭据位于用户指定的 `C:\Users\walex\Desktop\key\key.txt`。它只允许在临时测试程序运行时读取：

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

- 渲染层先将 `isRoomOpen` 切换为 `true`，再等待主进程完成窗口模式调整。
- 如果 IPC 调用失败，再回滚为桌宠页面并记录错误。
- 这样窗口尺寸和页面内容的切换顺序保持一致，不再把桌宠画布拉伸到房间尺寸。

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
