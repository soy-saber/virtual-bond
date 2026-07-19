# Virtual Bond / 虚拟纽带

AI 驱动的桌面陪伴应用。项目希望建立一种平等、持续、可沉淀记忆的数字伙伴关系，而不只是一个会弹出对话框的桌宠。

## 项目状态

当前版本为 `0.1.0`，处于桌面原型阶段。桌面应用壳、双模式窗口、本地对话持久化和真实流式 AI 对话已经可用，角色动画和长期记忆仍在开发计划中。

### 已实现

- Electron 透明无边框桌面窗口
- 可拖拽、置顶并记忆位置的悬浮桌宠，支持 Windows 高 DPI 稳定拖动
- 可在 `45%–120%` 范围调整桌宠显示比例，窗口与交互区域同步缩放
- 桌宠与完整陪伴空间双模式切换
- 关闭陪伴空间时自动返回桌宠，桌宠状态再负责隐藏或退出应用
- 系统托盘、右键菜单和 `Ctrl+Shift+B` 显示/隐藏快捷键
- 单实例运行和关闭后驻留托盘
- Vue 3 + TypeScript 陪伴空间界面
- SQLite 角色、对话和应用设置持久化
- 默认角色“澄夏”和真实流式对话，本地验收默认使用 DeepSeek 直连
- OpenAI Responses、Claude、Gemini 和自定义 OpenAI 兼容 API
- Electron `safeStorage` 加密密钥与模型设置界面
- CCSwitch 当前配置、分享链接和复制 JSON 导入
- 停止生成、超时以及常见 API 错误提示
- 基于 context isolation、preload 和 IPC 的受控桌面 API
- 数据驱动皮肤清单解析、用户皮肤目录扫描和路径安全校验
- PixiJS 规则网格 Sprite Sheet 播放、PNG 尺寸校验和 CSS 桌宠降级
- 面向图片模型的中文 Sprite Sheet 生成 Prompt 模板
- 与普通聊天隔离的 GPT Image 2 图片 Provider 与安全密钥
- Windows、macOS 和 Linux 打包配置

### 尚未实现

- 可编辑角色人设、世界观与对话风格
- 动作状态机、皮肤选择界面和自主活动范围
- 图片生成设置界面、参考图选择、任务进度与历史记录
- 长期记忆检索、对话总结和关系成长
- 共同记忆、日常记录、衣橱、签到和轻量玩法
- 更完整的 Provider / IPC 测试覆盖和正式自动更新

## 当前架构

```text
src/
├─ main/
│  ├─ index.ts       # Electron 窗口、托盘、快捷键和桌宠拖拽
│  ├─ database.ts    # Electron 数据库入口
│  ├─ database-core.ts     # SQLite 迁移、角色、对话和设置
│  ├─ chat-provider.ts      # 多 Provider 流式模型调用
│  ├─ provider-settings.ts  # 加密密钥、设置和 CCSwitch 导入
│  ├─ image-provider.ts     # 独立图片 Provider 与安全设置
│  └─ ipc.ts                # 主进程业务 IPC
├─ preload/
│  ├─ index.ts       # 暴露给渲染进程的受控 API
│  └─ index.d.ts     # API 类型声明
└─ renderer/
   └─ src/
      ├─ App.vue     # 陪伴空间和对话界面
      ├─ PetView.vue # 悬浮桌宠界面
      ├─ PetSpritePlayer.vue # PixiJS 通用序列帧播放器
      └─ SettingsPanel.vue # 模型设置界面
```

主进程拥有窗口、数据库、密钥和模型调用能力；渲染进程只通过 preload 暴露的 API 调用这些能力。用户消息和完成或主动停止后的伙伴回复会写入 SQLite。

## 开发

建议使用 Node.js LTS。

```bash
npm ci
npm run dev
```

质量检查：

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

一次运行全部检查：

```bash
npm run check
```

打包：

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

如果 Electron 二进制下载超时，可以临时配置镜像后重新安装：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm ci
```

完整技术选型见 [`docs/tech-stack.md`](docs/tech-stack.md)。

皮肤包、桌宠缩放和动画资源规范见 [`docs/skin-system.md`](docs/skin-system.md)，中文 Sprite Sheet 生图模板见 [`resources/prompts/sprite-sheet.zh-CN.md`](resources/prompts/sprite-sheet.zh-CN.md)。

图片 API 与安全密钥说明见 [`docs/image-generation.md`](docs/image-generation.md)。

本轮开发中遇到的环境、Electron、SQLite、CCSwitch、流式 IPC 和密钥安全问题，见 [`docs/troubleshooting.md`](docs/troubleshooting.md)。

## 开发计划

计划按“先完成可用对话闭环，再增加表现和长期关系能力”的顺序推进。

### `0.2.0`：真实 AI 对话闭环

目标：让用户配置自己的 API Key，并与澄夏进行真实、流式、可恢复的模型对话。

- [x] 定义统一的流式 Provider 调用层
- [x] 支持 OpenAI Responses、Claude、Gemini 和自定义 OpenAI 兼容 API
- [x] 使用 Electron `safeStorage` 加密保存 API Key
- [x] 增加模型、API 地址和角色附加指令设置
- [x] 支持流式回复、停止生成和超时
- [x] 组装最近对话和角色状态作为模型上下文
- [x] 增加有限自动重试和可持久化的消息状态

验收标准：

- 用户不需要修改源码即可配置模型
- 发送消息后可以实时看到流式回复
- 应用重启后能继续已有对话
- Key 缺失、网络失败和接口限流都有明确提示
- API Key 不以明文写入数据库或日志

### `0.3.0`：数据可靠性与工程基础

目标：为后续记忆、角色和玩法功能建立可升级、可测试的数据层。

- [x] 实现真正的数据库版本迁移
- [x] 增加 IPC 参数校验和消息长度限制
- [x] 将消息写入、回复状态更新设计为可恢复流程
- [x] 拆分 Provider、数据库、对话和设置模块
- [x] 增加数据库迁移与消息状态单元测试
- [x] 增加 GitHub Actions
- [x] 统一 Git 换行符与 Prettier 配置
- [ ] 增加 Provider 单元测试和关键 IPC 集成测试

验收标准：

- 旧版本数据库可以无损升级
- AI 请求中断后不会留下无法处理的半成品数据
- 核心数据层和 IPC 有自动化测试保护
- Typecheck、Lint、测试和构建可在 CI 中通过

### `0.4.0`：角色视觉与状态

目标：用真实角色素材替换 CSS 占位角色，让桌宠状态能响应对话和系统事件。

- [x] 增加可持久化的桌宠显示比例，并同步缩放窗口、点击区域和气泡
- [x] 建立 PixiJS 角色渲染组件
- [x] 定义开放式皮肤目录与 `manifest.json`，仅将 `idle` 设为必选动作
- [x] 动态加载规则网格 sprite sheet，不在加载器中硬编码动作名称和帧数
- [x] 支持动作 FPS、循环方式、脚底锚点及动作缺失回退
- 支持点击区域和自动水平翻转
- 建立可打断、可回退的通用动作状态机
- 增加皮肤扫描、切换、错误提示和开发模式热重载
- 为行走等移动动作增加屏幕安全区、活动半径与低打扰策略

验收标准：

- 桌宠和陪伴空间使用同一套角色状态模型
- 更换符合规范的皮肤或增加普通动画时无需修改加载器代码
- 调整尺寸、重启应用及切换显示器后，桌宠尺寸与位置保持正确
- 动画切换不会导致窗口跳动或明显性能下降
- 素材损坏或缺失时应用仍可进入对话

### `0.5.0`：长期记忆与关系成长

目标：让伙伴能够沉淀可解释、可管理的长期记忆，而不是无限拼接聊天记录。

- 提取用户偏好、人物、事件和约定
- 对较长对话进行分段总结
- 增加记忆查看、修改、删除和禁用能力
- 优先使用 SQLite 实现记忆存储和检索
- 在数据规模和召回需求明确后再决定是否引入向量数据库
- 使用关系事件记录驱动纽带等级与经验

验收标准：

- 伙伴能在后续对话中引用经过确认的重要信息
- 用户可以知道某条记忆来自哪里并进行管理
- 删除记忆后不会继续进入模型上下文
- 关系成长由可追溯事件计算，而不是硬编码数值

### `1.0.0`：完整体验与发布

目标：完成可分发、可升级、可维护的第一个正式版本。

- 实现共同记忆、日常记录、签到和轻量互动
- 实现衣橱和角色资源管理
- 增加数据导入、导出和彻底删除
- 完善隐私说明、首次启动和故障恢复
- 完成 Windows 安装包和自动更新
- 验证多显示器、高 DPI、休眠恢复和长时间运行
- 根据维护能力再扩展 macOS 和 Linux 发布

验收标准：

- 新用户可以独立完成安装、模型配置和首次对话
- 更新应用不会丢失角色、设置、对话和记忆
- 核心功能在离线或服务不可用时能明确降级
- 用户可以完整导出或删除自己的本地数据

## 当前优先级

接下来应依次完成：

1. 增加皮肤选择、预览、重新扫描和错误提示界面
2. 建立通用动画状态机、自动水平翻转和安全活动范围
3. 增加图片生成设置界面、参考图选择和任务状态
4. 通过 OpenCode CLI 提供与普通聊天隔离的 Agent 能力
5. 开发长期记忆与关系成长

在真实对话闭环稳定之前，暂不优先开发生图、衣橱和小游戏，避免在核心陪伴体验尚未成立时扩大功能面。

## 已知工程问题

- 历史 Windows 检出文件可能仍保留 CRLF；新检出由 `.gitattributes` 统一为 LF
- 项目路径包含空格时，`better-sqlite3` 原生重建可能产生 `node-gyp` 警告
- 当前完整陪伴空间可能继续保持始终置顶，需要进一步确认交互预期
- Provider 和 IPC 自动化覆盖仍不完整，模型调用需要按实际服务手工回归

## 提交约定

每次功能或修复提交都必须同步更新本 README 与 `docs/` 中对应的设计、计划或问题记录，确保代码状态、验收结果和后续开发上下文一致。
