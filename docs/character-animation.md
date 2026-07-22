# Q 版角色与动作实现方案

最后更新：2026-07-22

## 当前角色基准

- Q 版设定板：[`makise-kurisu-chibi-design-v1.png`](../resources/concepts/makise-kurisu-chibi-design-v1.png)
- 首张行走生成原图：[`makise-kurisu-chibi-walk-right-sheet-v1-key.png`](../resources/concepts/makise-kurisu-chibi-walk-right-sheet-v1-key.png)
- 透明化原图：[`makise-kurisu-chibi-walk-right-sheet-v1-alpha.png`](../resources/concepts/makise-kurisu-chibi-walk-right-sheet-v1-alpha.png)
- 运行原型 Sheet：[`walk-right.png`](../resources/animation-prototypes/makise-kurisu-chibi/walk-right.png)
- 正面停留帧：[`idle-front.png`](../resources/animation-prototypes/makise-kurisu-chibi/idle-front.png)

角色约三头身，保留红棕长发、蓝眼、白衬衫、红领带、棕色外套、深色短裤、丝袜和短靴。长发外轮廓、红领带与外套下摆是缩小后的主要识别点。

## 一张图能否包含一个动作的系列精灵图

可以。当前已经用一张 `1536 × 1024` 图片生成 `4 × 2`、共 8 帧的向右行走动作，每格逻辑尺寸为 `384 × 512`。

但生成图片不能直接投入运行。图片模型能保持大体身份和动作相位，却不能可靠保证逐帧脚底、水平中心、人物高度和非动作细节完全一致。正式流程必须包含：

1. 参考 Q 版设定板生成固定网格 Sheet。
2. 使用纯色色键背景生成，再转换为透明 Alpha。
3. 按清单中的行列数切格。
4. 读取每帧 Alpha 包围盒。
5. 统一人物高度、水平中心和脚底基线。
6. 检查头发长度、服装、五官与手脚数量是否漂移。
7. 重新拼接为运行时 Sheet，并在应用中循环播放验收。

本项目使用 `scripts/normalize-sprite-sheet.py` 完成第 3–5 步。

## 移动系统

### 逻辑层

角色位置、房间路径和动作状态继续由纯 TypeScript 状态机负责，PixiJS 只消费快照：

```text
用户或日程选择目标房间
→ 生成同层或跨层节点路径
→ action = walk
→ 每帧按速度更新逻辑坐标
→ 根据 dx 设置 facing
→ 到达连接节点时播放 turn / elevator / stairs
→ 到达房间锚点
→ 切换为 studying / eating / resting / idle
```

逻辑坐标不依赖精灵图像素尺寸。脚底锚点始终映射到状态机位置，角色头发和外套可以越出命中框，但不能改变地面接触点。

### 表现层

- `walk-right` 是基准动作。
- 移动时使用侧面行走精灵，到达房间、等待和对话暂停时切换正面停留精灵；正面帧由 `scripts/build-chibi-idle.py` 从设定板本地提取，不调用图片 API。
- 若角色服装和发型镜像可接受，向左移动可先通过 `sprite.scale.x = -1` 实现；最终应检查外套绑带、发缝和道具是否需要独立 `walk-left`。
- PixiJS `AnimatedSprite` 按 manifest 的 `frames / columns / fps / loop` 播放。
- 移动开始时从当前动作进入 `turn` 或 `walk`，停止时等待接触帧后切回 `idle`，避免脚步突然截断。
- 角色的 `container.position` 表示脚底位置；精灵 anchor 使用统一的脚底中心，而不是图片中心。

### 动作可读性验收

当前 `walk-right` 虽然具有 8 帧侧面图，但缺少可读的完整迈步循环，不能仅靠提高帧率、上下起伏、身体旋转或阴影缩放修复。下一版至少要覆盖：

1. 接触：前脚脚跟或脚掌落地，后脚准备离地。
2. 下压：身体重心最低，两腿承重关系明确。
3. 经过：摆动腿经过支撑腿，双脚不能同时向前滑。
4. 抬升：身体重心最高，摆动腿向下一次接触点伸出。
5. 左右腿交换后重复上述相位，首尾帧连续且脚底没有反向滑动。

桌宠拎起不能复用走路姿势。动作应拆为离地预备、悬挂循环和放下回弹；悬挂阶段的受力点位于头顶或衣领附近，躯干在受力点正下方，腿部自然下垂并随水平移动反向滞后，头发和外套再晚一拍跟随。当前 `dragging` Sheet 的脚向前姿势不符合这一约束，必须重绘。

桌宠单击回应是一次性动作，8 帧建议以约 `5 fps` 播放，并包含预备、明确回应姿势、短暂停留和收势。当前 Sheet 已先放慢到 1.6 秒，但动作语义仍需通过重绘增强。

### 跨楼层

第一版在升降井节点之间直接插值，并在角色抵达电梯时暂停普通行走动画：

```text
walk-to-elevator → elevator-enter → elevator-loop → elevator-exit → walk-to-room
```

楼梯版本需要独立 `stairs-up` 和 `stairs-down` 动作，因为普通侧面行走无法自然贴合斜坡。没有对应素材时优先使用电梯，不应让角色沿楼梯漂移。

## 首批动作资源

| 动作       | 建议帧数 | 循环 | 用途                 |
| ---------- | -------: | ---- | -------------------- |
| idle       |        8 | 是   | 普通站立与轻微呼吸   |
| walk-right |        8 | 是   | 水平移动基准         |
| turn       |      4–6 | 否   | 改变方向或回应用户   |
| sit-down   |      6–8 | 否   | 进入座椅动作         |
| sit-idle   |      6–8 | 是   | 阅读、休息的基础坐姿 |
| stand-up   |      6–8 | 否   | 离开座椅             |
| thinking   |      6–8 | 是   | 模型生成前状态       |
| speaking   |      6–8 | 是   | 流式回复状态         |
| studying   |        8 | 是   | 实验室和书房         |
| eating     |        8 | 是   | 厨房或餐桌           |
| resting    |        8 | 是   | 卧室和休息区         |

## 下一步

标准化后的 `walk-right` 已接入 `MultiFloorScene`，替换程序化剪影。同层移动播放 8 帧循环，向左暂时水平镜像；停止和对话暂停时切换为正面停留帧。现有行走 Sheet 只作为方向与管线原型，不再视为完整迈步素材。

跨楼层已经使用原创玻璃电梯表现：升降井明确标出 `3F 观测层 / 2F 研究层 / 1F 生活层` 三个节点。角色走到当前层节点后停止步行动画，随后在经过的楼层节点中短暂随轿厢露面，再离散跳到下一个节点；不会沿竖井连续行走。到达目标层后隐藏轿厢并恢复走路。后续继续：

1. 重绘包含完整接触循环的 `walk-right`，再评估是否需要独立 `walk-left`。
2. 重绘桌宠 `dragging` 和 `interaction`，分别满足悬挂受力和一次性动作可读性要求。
3. 增加 `elevator-enter` 和 `elevator-exit`，避免角色瞬间进入或离开轿厢。
4. 实机验证 96–192 像素角色高度下的轮廓、锚点和帧节奏。
5. 通过局部修帧或分层骨骼动画减少长发和外套在不同帧中的细节漂移。
