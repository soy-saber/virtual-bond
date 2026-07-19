# 图片生成能力

Virtual Bond 将图片生成与普通对话 Provider 完全隔离。普通聊天继续使用 DeepSeek；图片能力使用独立的 OpenAI-compatible API 配置，当前本地默认服务为 WisArt GPT Image 2。

## 当前实现

- 默认 Base URL：`https://wisart.kuaileshifu.com/v1`
- 默认模型：`gpt-image-2`
- 支持 `POST /images/generations` 和最多 16 张参考图的 `POST /images/edits`，兼容 Base64 与临时 URL 响应。
- 主进程持有 API Key 和网络访问能力，渲染进程只能通过受控 IPC 发起请求。
- 图片 Key 使用单独的 SQLite 设置项和 Electron `safeStorage` 加密，不复用聊天 Key。
- 本地开发首次运行时可读取桌面 `key.txt` 第一行，保存成功后不需要持续依赖该文件。
- Prompt、尺寸、质量和生成数量在主进程调用前进行校验。
- URL 响应只允许通过 HTTP 或 HTTPS 下载。

当前 IPC：

- `image-settings:get`
- `image-settings:save`
- `image-settings:clear-api-key`
- `images:generate`
- `images:edit-with-picker`

参考图必须由系统文件选择器明确选择，渲染层不能传入任意磁盘路径。图片设置界面、生成任务进度、取消请求、结果保存界面和历史记录尚未实现。

## 安全约束

- 禁止把真实 Key 写入源码、文档、测试、日志或 Git 历史。
- 桌面 Key 文件只读取第一行，避免把同文件中的说明或其他配置误当成凭据。
- 参考图路径不通过普通渲染 IPC 任意传入；后续参考图功能应使用系统文件选择器授予访问。
- 临时图片 URL 必须及时下载，不能作为长期皮肤资源保存。
- 正式生成默认从 `low`、`n=1` 开始，确认 Prompt 后再提高质量。
