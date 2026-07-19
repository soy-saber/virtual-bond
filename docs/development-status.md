# 当前开发进度与接续说明

最后更新：2026-07-20

当前分支：`main`

当前阶段：`0.4.0` 角色视觉与状态

本文是每次推送必须更新的开发快照。目标是在另一台电脑只读取仓库时，也能确定当前已经完成什么、如何恢复环境、下一步从哪里继续，以及哪些状态不会随 Git 同步。

## 本次远端快照

- 分支：`main`
- 高清待机与渲染：`7cad11b feat: refine high-resolution idle rendering`
- 命中范围与气泡：`8df6759 fix: align pet hit regions and speech bubbles`
- 皮肤管理闭环：`5b3f6ee feat: add persistent skin management`
- 陪伴空间响应式布局：`11a3922 fix: anchor room layout to the visible stage`
- 推送前验证：`npm run check` 全部通过，包括 TypeScript、12/12 测试、ESLint 和 Electron 生产构建。
- 补充检查：`git diff --check` 通过；staged diff 未发现 API Key 或桌面 Key 文件路径。

新电脑检出后可运行 `git log -5 --oneline` 对照本节。若远端出现更新，以文件顶部日期和 `main` 最新提交为准。

## 本次进度

- 参考角色已经具有仓库内可追踪的 4K RGBA 母版和 `4096 × 2048`、8 帧待机 Sheet。
- `scripts/build-reference-idle.py` 可完全在本地从 4K 母版重建待机动画，不调用图片 API，也不消耗生图 Token。
- 待机动画为约 4 秒一周期的克制呼吸：骨盆与腿脚锁定，上胸承担主运动，头颈保留最小可见联动。
- PixiJS 使用自适应 3×–4× 内部渲染分辨率、线性采样、mipmap 和像素对齐，改善桌宠放大后的轮廓与细节。
- 桌宠显示比例上限已经提高到 `240%`，方便近距离检查脸部与服装细节。
- 皮肤 `canvas.hitbox` 已映射为人物拖拽区，人物、按钮和气泡关闭按钮之外的透明窗口区域会把鼠标交还给下层应用。
- 默认问候气泡已移除；角色只在实际 `say` 时显示消息，并按非空白字符数在 `2.4–9` 秒后淡出。
- 设置页已增加皮肤动画预览、选择持久化、打开用户目录、手动重新扫描和损坏皮肤错误列表；桌宠与陪伴空间会立即同步新选择。
- 已选皮肤被移除或损坏时会自动回退，皮肤根目录无法读取时也不会中断其他目录扫描。
- 陪伴空间已经移除外层透明留白，窗口最大化后内容铺满可用区域；角色画布、显示尺寸和脚底锚点会随舞台尺寸重新计算。
- 当前这一轮实机反馈已达到“差不多可以推送”的状态；呼吸幅度后续只做小幅视觉微调，不应再次扩大胸腹主运动。

## 新电脑恢复步骤

```powershell
git clone git@github.com:soy-saber/virtual-bond.git
Set-Location virtual-bond
npm ci
npm run check
npm run dev
```

如需重建参考待机 Sheet，额外安装本地图片处理依赖：

```powershell
py -m pip install Pillow numpy
py scripts/build-reference-idle.py
```

重建脚本会覆盖 `resources/skins/reference-companion/animations/idle.png`。执行后应运行 `npm run check` 并实机确认脚底不漂移、下半身不呼吸、胸肩和头颈只有轻微联动。

## 不会随仓库同步的状态

- API Key 不在仓库中。普通聊天 Key 由应用通过 Electron `safeStorage` 保存在本机；换电脑后需要在设置中重新填写或重新导入 CCSwitch 配置。
- 本地验收默认使用 DeepSeek 直连，而不是 Codex 中转；不要把桌面上的 Key 文件路径、内容或解密后的值写入仓库、日志和文档。
- 图片生成 Key 与聊天 Key 相互隔离。任何真实生图调用都必须先说明模型、尺寸、质量、参考图数量和用途，并取得用户明确批准。
- SQLite 对话、角色和设置数据位于 Electron 的本机 `userData` 目录，不通过 Git 同步。新电脑读取仓库只能恢复代码与内置资源，不能自动恢复本机对话历史。
- Agent 能力尚未接入应用；规划通过 OpenCode CLI 提供，并与普通聊天 API 分离。

## 当前验收入口

1. 启动后确认桌宠待机动画能够播放，脚底与下半身保持稳定。
2. 在 `45%–180%` 范围调整桌宠比例，观察头发、服装边缘和脸部细节是否仍有明显彩边或采样闪烁。
3. 在人物外透明区域点击下层应用，确认只有人物包围盒、底部按钮和可见气泡关闭按钮拦截鼠标。
4. 双击角色进入陪伴空间，关闭空间后应回到桌宠状态。
5. 使用 DeepSeek 直连发送消息，确认流式文本、停止生成、消息气泡自动淡出和历史恢复正常。
6. 运行 `npm run check`，保证类型检查、测试、Lint 和生产构建全部通过。

## 下一步开发顺序

1. 实机复验陪伴空间普通窗口、最大化和连续拖动调整尺寸时的角色站位。
2. 将陪伴空间扩展为“雨夜书房”：远景使用窗户、城市灯光和缓慢雨滴，中景放置角色与座椅或地毯，前景加入小桌、热饮蒸汽和植物或书本剪影。第一版使用本地 CSS，不调用图片生成 API。
3. 建立低打扰动作状态机：先接入 `idle`、`blink`、`look-around`、`thinking`、`speaking` 和 `interaction`，使用优先级、打断、回退和低频随机调度，不让角色持续运动。
4. 在动作状态机稳定后增加自动水平翻转和屏幕安全活动范围。
5. 增加图片生成设置、参考图选择、任务进度与历史记录；实际生图仍需逐次批准。
6. 通过 OpenCode CLI 接入隔离的 Agent 能力。
7. 开发长期记忆与关系成长。

## 推送维护约定

每次推送前必须：

- 更新 README 的已实现功能、当前优先级和已知问题。
- 更新本文件的日期、本次进度、验收状态和下一步。
- 把新遇到的问题及解决方案追加到 `docs/troubleshooting.md`。
- 同步更新受影响的设计文档，不能只改代码。
- 运行 `npm run check` 和 `git diff --check`。
- 检查 staged diff 中没有 API Key、本机绝对 Key 路径或不应公开的原始素材。
