# Virtual Bond / 虚拟纽带

AI 驱动的桌面陪伴应用。项目希望建立一种平等、持续、可沉淀记忆的数字伙伴关系，而不只是一个会弹出对话框的桌宠。

## 当前进度

项目处于 `0.1.0` 原型阶段，目前包含：

- Electron 透明无边框桌面窗口
- 可拖拽、置顶并记忆桌面位置的悬浮桌宠
- 桌宠与完整陪伴空间双模式切换
- 系统托盘、右键菜单与 `Ctrl+Shift+B` 显示/隐藏快捷键
- Vue 3 + TypeScript 陪伴空间界面
- 基础对话交互与本地演示响应
- 安全的 preload / IPC 窗口控制
- 为 PixiJS、SQLite 与 OpenAI Provider 预留的依赖和架构入口

## 开发

```bash
npm install
npm run dev
```

质量检查：

```bash
npm run typecheck
npm run lint
npm run build
```

完整技术选型见 [`docs/tech-stack.md`](docs/tech-stack.md)。

## 路线图

1. SQLite 数据模型与对话持久化
2. OpenAI / Claude Provider 与加密密钥存储
3. PixiJS sprite sheet 角色动画
4. RAG 长期记忆与关系成长系统
5. 衣橱、签到及轻量互动玩法
