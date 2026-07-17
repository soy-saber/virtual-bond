# 虚拟纽带 (Virtual Bond) - 技术选型文档

**版本**: 1.0  
**日期**: 2026-07-17  
**状态**: 已确认

---

## 文档目的

本文档详细记录了"虚拟纽带"项目的所有技术选型决策，包括选型理由、备选方案对比、以及实施要点。供开发团队参考，确保技术栈一致性。

---

## 项目概述

**项目名称**: 虚拟纽带 (Virtual Bond)  
**项目定位**: AI 驱动的桌面陪伴应用（非传统"桌宠"，强调平等伙伴关系）  
**核心特性**:

1. 高度可自定义的人设系统（世界观、性格、对话风格）
2. AI 生成的多场景、多服装角色视觉资产（sprite sheet 动画）
3. 基于大模型的自然语言对话交互（RAG 增强记忆）
4. 轻量互动游戏（签到、猜词等）
5. 完整的数据持久化和统计系统

---

## 1. 桌面应用框架

### 选型: **Electron**

#### 理由

- ✅ 成熟生态，npm 包丰富，Vue 3 和 PixiJS 集成简单
- ✅ 跨平台一致性高（Windows/macOS/Linux）
- ✅ 透明窗口、置顶、拖拽等桌宠必需功能支持完善
- ✅ 开发者熟悉 Web 技术栈，学习成本低
- ❌ 应用体积较大（基础打包 ~150MB）

#### 备选方案对比

| 方案         | 优点                        | 缺点                                   | 评分       |
| ------------ | --------------------------- | -------------------------------------- | ---------- |
| **Electron** | 生态成熟，开发效率高        | 体积大，内存占用高                     | ⭐⭐⭐⭐⭐ |
| **Tauri**    | 体积小（~10MB），内存占用低 | Rust 学习成本高，PixiJS 集成需要桥接层 | ⭐⭐⭐     |
| **NW.js**    | 与 Electron 类似            | 社区较小，更新慢                       | ⭐⭐       |

#### 实施要点

- 使用 `electron-builder` 进行打包
- 配置 `frameless: true` + `transparent: true` 实现透明窗口
- 使用 `setIgnoreMouseEvents()` 处理鼠标穿透
- 启用 `alwaysOnTop` 实现置顶

---

## 2. 前端框架

### 选型: **Vue 3 (Composition API) + TypeScript**

#### 理由

- ✅ 开发者已有 Vue 经验（参考 PetNest 项目）
- ✅ Composition API 适合复杂状态管理
- ✅ TypeScript 提供类型安全，减少运行时错误
- ✅ 组件化开发，代码可维护性高
- ✅ 响应式系统天然适合 UI 驱动的桌面应用

#### 备选方案对比

| 方案        | 优点                     | 缺点                             | 评分       |
| ----------- | ------------------------ | -------------------------------- | ---------- |
| **Vue 3**   | 学习曲线平缓，组件化清晰 | 生态略小于 React                 | ⭐⭐⭐⭐⭐ |
| **React**   | 生态最大，招聘容易       | Hooks 学习成本高，无官方状态管理 | ⭐⭐⭐⭐   |
| **原生 JS** | 无框架依赖，体积最小     | 开发效率低，代码难维护           | ⭐⭐       |

#### 实施要点

- 使用 `<script setup>` 语法糖简化组件编写
- 全局启用 TypeScript 严格模式
- 按功能模块组织组件（views/components/composables）

---

## 3. 构建工具

### 选型: **electron-vite**

#### 理由

- ✅ 专为 Electron + Vite 设计，开箱即用
- ✅ 主进程和渲染进程分离打包，支持热重载
- ✅ 自动处理 Electron 的 preload 脚本
- ✅ 比 webpack 快 10-100 倍（Vite 基于 esbuild）

#### 备选方案对比

| 方案                | 优点               | 缺点                            | 评分       |
| ------------------- | ------------------ | ------------------------------- | ---------- |
| **electron-vite**   | 开箱即用，配置简单 | 社区相对较新                    | ⭐⭐⭐⭐⭐ |
| **Vite + 手动配置** | 完全自定义         | 需要手动配置主进程/渲染进程构建 | ⭐⭐⭐     |
| **Webpack**         | 生态成熟           | 构建慢，配置复杂                | ⭐⭐       |

#### 实施要点

- 安装: `npm create @quick-start/electron`
- 配置文件: `electron.vite.config.ts`
- 开发命令: `npm run dev`
- 打包命令: `npm run build`

---

## 4. 2D 渲染引擎

### 选型: **PixiJS v8**

#### 理由

- ✅ 专注 2D 渲染，性能卓越（WebGL 加速）
- ✅ Sprite sheet 支持完善，自带 `AnimatedSprite` 类
- ✅ 体积适中（~450KB minified）
- ✅ 文档完善，社区活跃
- ✅ 支持透明背景和混合模式

#### 备选方案对比

| 方案                | 优点                       | 缺点                     | 评分       |
| ------------------- | -------------------------- | ------------------------ | ---------- |
| **PixiJS v8**       | 性能强，专注渲染           | 无物理引擎（不需要）     | ⭐⭐⭐⭐⭐ |
| **Phaser 3**        | 完整游戏引擎，物理引擎内置 | 体积大（~1MB），功能过剩 | ⭐⭐⭐     |
| **Canvas 原生 API** | 无依赖，体积最小           | 手动管理动画，开发效率低 | ⭐⭐       |

#### 实施要点

- 安装: `npm install pixi.js`
- 使用 `Application` 初始化渲染器
- 使用 `Spritesheet` 加载 sprite sheet + JSON manifest
- 使用 `AnimatedSprite` 播放动画

```typescript
import { Application, Assets, AnimatedSprite } from 'pixi.js'

const app = new Application({
  backgroundAlpha: 0, // 透明背景
  resizeTo: window
})

const sheet = await Assets.load('character.json')
const idleAnim = new AnimatedSprite(sheet.animations.idle)
idleAnim.play()
```

---

## 5. 本地数据库

### 选型: **SQLite (better-sqlite3)**

#### 理由

- ✅ 关系型数据库，SQL 查询强大，适合复杂统计
- ✅ 单文件存储，无需服务器
- ✅ `better-sqlite3` 是 Node.js 原生绑定，性能高于 `sqlite3`
- ✅ 支持事务、索引、外键约束
- ✅ 轻量（~1MB），适合桌面应用

#### 备选方案对比

| 方案                        | 优点             | 缺点                   | 评分       |
| --------------------------- | ---------------- | ---------------------- | ---------- |
| **SQLite (better-sqlite3)** | 关系型，查询强大 | 不支持异步（同步 API） | ⭐⭐⭐⭐⭐ |
| **IndexedDB**               | 浏览器原生，异步 | API 复杂，不支持 SQL   | ⭐⭐       |
| **LowDB**                   | JSON 文件，简单  | 性能差，无索引         | ⭐⭐       |

#### 实施要点

- 安装: `npm install better-sqlite3`
- 数据库文件路径: `app.getPath('userData')/virtual-bond.db`
- 使用迁移脚本管理数据库版本
- 核心表: `characters`, `conversations`, `stats`, `outfits`

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

const dbPath = path.join(app.getPath('userData'), 'virtual-bond.db')
const db = new Database(dbPath)

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT,
    persona_json TEXT,
    created_at INTEGER
  );
`)
```

---

## 6. 向量数据库 (RAG)

### 选型: **Chroma (本地嵌入版)**

#### 理由

- ✅ 轻量，可嵌入 Node.js 应用
- ✅ API 简单，支持 collection 隔离（每个角色独立）
- ✅ 自动管理向量索引，支持余弦相似度检索
- ✅ 无需外部服务，完全本地化
- ⚠️ 如果体积过大，可降级到简单的余弦相似度 + 本地存储

#### 备选方案对比

| 方案               | 优点                   | 缺点                       | 评分       |
| ------------------ | ---------------------- | -------------------------- | ---------- |
| **Chroma**         | 轻量，本地化，API 友好 | 文档相对较少               | ⭐⭐⭐⭐⭐ |
| **LanceDB**        | 性能更强               | 配置复杂，体积大           | ⭐⭐⭐     |
| **手写余弦相似度** | 无依赖，体积最小       | 需要自己管理向量存储和索引 | ⭐⭐⭐     |

#### 实施要点

- 安装: `npm install chromadb`
- 使用 OpenAI Embeddings API 生成向量
- 每个角色一个独立 collection: `character-{characterId}`
- 对话历史每 50 轮生成一次总结，存入向量库

```typescript
import { ChromaClient } from 'chromadb'

const client = new ChromaClient()
const collection = await client.createCollection({
  name: `character-${characterId}`
})

// 添加文档
await collection.add({
  documents: [worldview, background, ...knowledgeBase],
  ids: ['worldview', 'background', ...ids]
})

// 检索相关上下文
const results = await collection.query({
  queryTexts: [userInput],
  nResults: 3
})
```

---

## 7. AI 对话 API

### 选型: **Claude API + OpenAI GPT API（双支持，用户自选）**

#### 理由

- ✅ **Claude**: 理解力强，适合复杂人设和深度对话
- ✅ **OpenAI GPT**: 生态成熟，成本灵活（GPT-3.5 便宜，GPT-4o-mini 平衡）
- ✅ 双 API 支持给用户选择权，避免单点依赖
- ✅ 用户自备 API Key，应用不承担费用

#### 备选方案对比

| 方案                | 优点           | 缺点                        | 评分       |
| ------------------- | -------------- | --------------------------- | ---------- |
| **Claude + OpenAI** | 灵活，用户可选 | 需要维护两套 API 封装       | ⭐⭐⭐⭐⭐ |
| **仅 Claude**       | 理解力强       | 成本较高，单点依赖          | ⭐⭐⭐⭐   |
| **仅 OpenAI**       | 生态成熟       | Claude 的理解力优势无法利用 | ⭐⭐⭐⭐   |
| **本地 Ollama**     | 免费，完全离线 | 质量不如云端，需要 GPU      | ⭐⭐⭐     |

#### 实施要点

- 封装统一的 `ChatProvider` 接口
- 用户在设置中选择模型和填入 API Key
- API Key 加密存储到本地（使用 `safeStorage`）

```typescript
interface ChatProvider {
  sendMessage(prompt: string, history: Message[]): Promise<string>
}

class ClaudeProvider implements ChatProvider {
  async sendMessage(prompt: string, history: Message[]): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: prompt }]
      })
    })
    return response.json()
  }
}
```

---

## 8. 生图 API

### 选型: **Replicate**

#### 理由

- ✅ 支持 FLUX.1-dev + IP-Adapter + ControlNet 的完整链路
- ✅ 按用量计费，无需订阅
- ✅ API 稳定，文档完善
- ✅ 支持进度查询（polling）
- ✅ 社区有大量 sprite sheet 生成案例

#### 备选方案对比

| 方案             | 优点                     | 缺点                        | 评分       |
| ---------------- | ------------------------ | --------------------------- | ---------- |
| **Replicate**    | 灵活，支持完整工作流     | 按用量计费，需要 API Key    | ⭐⭐⭐⭐⭐ |
| **Stability AI** | 官方 API，稳定           | 不支持 IP-Adapter，灵活性低 | ⭐⭐⭐     |
| **Segmind**      | 有 sprite sheet 专用 API | 角色一致性不确定            | ⭐⭐⭐     |
| **本地 ComfyUI** | 完全可控                 | 需要高性能 GPU，部署复杂    | ⭐⭐       |

#### 实施要点

- 安装: `npm install replicate`
- 工作流: 参考图 → IP-Adapter → ControlNet pose → 生成帧序列
- 每个动作预定义姿势序列（存储为 OpenPose JSON）
- 使用固定 seed 策略确保同一服装下的一致性

```typescript
import Replicate from 'replicate'

const replicate = new Replicate({ auth: apiKey })

const output = await replicate.run(
  'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
  {
    input: {
      image: referenceImage, // Base64 或 URL
      prompt: `${outfitDescription}, ${action} pose, pixel art style`,
      ip_adapter_scale: 0.85,
      controlnet_conditioning_scale: 0.7,
      pose_image: poseImage,
      seed: baseSeed + index
    }
  }
)
```

---

## 9. 背景去除

### 选型: **Replicate API (background-removal)**

#### 理由

- ✅ 云端处理，不增加应用体积
- ✅ 模型质量高（基于 RMBG-1.4）
- ✅ API 简单，与生图流程无缝集成
- ❌ 额外费用（但每张图 ~$0.001，可接受）

#### 备选方案对比

| 方案              | 优点               | 缺点                                  | 评分       |
| ----------------- | ------------------ | ------------------------------------- | ---------- |
| **Replicate API** | 质量高，无体积负担 | 额外费用                              | ⭐⭐⭐⭐⭐ |
| **rembg (本地)**  | 免费，无 API 调用  | 需要打包 Python 环境，体积增加 ~100MB | ⭐⭐⭐     |
| **手写图像处理**  | 完全自定义         | 质量差，边缘毛刺多                    | ⭐⭐       |

#### 实施要点

- 使用 Replicate 的 `rmbg-1.4` 模型
- 在生成帧后批量调用
- 输出透明 PNG

```typescript
const output = await replicate.run(
  'lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1',
  { input: { image: frameImage } }
)
```

---
