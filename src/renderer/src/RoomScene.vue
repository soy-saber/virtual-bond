<script setup lang="ts">
import 'pixi.js/unsafe-eval'
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Text,
  type Ticker
} from 'pixi.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ACTION_LABELS,
  ROOM_ANCHORS,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  RoomStateMachine,
  type ConversationState,
  type RoomAction,
  type RoomAnchorId,
  type RoomCharacterSnapshot,
  type RoomContext
} from './room-state'

const props = withDefaults(
  defineProps<{
    width?: number
    height?: number
    context?: RoomContext
    conversationState?: ConversationState
    companionName?: string
  }>(),
  {
    width: 720,
    height: 640,
    context: 'free',
    conversationState: 'idle',
    companionName: '牧濑红莉栖'
  }
)

const emit = defineEmits<{
  ready: []
  status: [payload: { action: RoomAction; label: string; anchorId?: RoomAnchorId }]
}>()

const host = ref<HTMLDivElement>()
const machine = new RoomStateMachine()
let app: Application | undefined
let world: Container | undefined
let character: Container | undefined
let shadow: Graphics | undefined
let body: Container | undefined
let face: Container | undefined
let leftLeg: Graphics | undefined
let rightLeg: Graphics | undefined
let book: Container | undefined
let bowl: Container | undefined
let thought: Container | undefined
let speech: Container | undefined
let sleep: Text | undefined
let resizeObserver: ResizeObserver | undefined
let lastAction: RoomAction | undefined
let elapsed = 0
let ambientDueAt = 0
let ambientEndsAt = 0
let tickerUpdate: ((ticker: Ticker) => void) | undefined
let isInitialized = false
let isDisposed = false

function panel(x: number, y: number, width: number, height: number, color: number): Graphics {
  return new Graphics()
    .roundRect(x, y, width, height, Math.min(18, height / 4))
    .fill({ color })
    .stroke({ color: 0xffffff, alpha: 0.08, width: 2 })
}

function label(text: string, x: number, y: number, size = 15, color = 0xded8e8): Text {
  const result = new Text({
    text,
    style: {
      fontFamily: "Inter, 'Microsoft YaHei', sans-serif",
      fontSize: size,
      fill: color,
      fontWeight: '600'
    }
  })
  result.position.set(x, y)
  return result
}

function makeInteractive(target: Container, anchorId: RoomAnchorId, title: string): void {
  target.eventMode = 'static'
  target.cursor = 'pointer'
  target.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation()
    machine.requestAnchor(anchorId)
  })
  const badge = new Container()
  badge.alpha = 0
  badge.addChild(
    panel(-5, -28, Math.max(64, title.length * 17), 24, 0x68545b),
    label(title, 7, -25, 12, 0xfff4e8)
  )
  target.addChild(badge)
  target.on('pointerover', () => {
    badge.alpha = 0.96
  })
  target.on('pointerout', () => {
    badge.alpha = 0
  })
}

function buildWindow(): Container {
  const container = new Container()
  container.position.set(480, 58)
  container.zIndex = 100
  const glow = new Graphics().rect(-20, -15, 326, 232).fill({ color: 0x8ab4ca, alpha: 0.16 })
  const frame = new Graphics()
    .roundRect(0, 0, 286, 194, 8)
    .fill({ color: 0x294663 })
    .stroke({ color: 0xb99d91, width: 12 })
    .moveTo(143, 0)
    .lineTo(143, 194)
    .stroke({ color: 0x9f8984, width: 8 })
    .moveTo(0, 98)
    .lineTo(286, 98)
    .stroke({ color: 0x9f8984, width: 7 })
  const moon = new Graphics().circle(228, 43, 24).fill({ color: 0xfff2cf, alpha: 0.72 })
  const city = new Graphics()
  for (let index = 0; index < 15; index += 1) {
    const x = 8 + index * 19
    const height = 25 + ((index * 17) % 58)
    city.rect(x, 184 - height, 13, height).fill({ color: index % 3 ? 0x25344c : 0x34445a })
    for (let lightY = 0; lightY < height - 8; lightY += 12) {
      if ((index + lightY) % 4 !== 0) {
        city.rect(x + 3, 179 - lightY, 2, 3).fill({ color: 0xffd69a, alpha: 0.72 })
      }
    }
  }
  const rain = new Graphics()
  for (let index = 0; index < 28; index += 1) {
    const x = 5 + ((index * 43) % 280)
    const y = 5 + ((index * 31) % 172)
    rain
      .moveTo(x, y)
      .lineTo(x - 7, y + 20)
      .stroke({ color: 0xd8ecf2, alpha: 0.28, width: 1 })
  }
  container.addChild(glow, frame, moon, city, rain)
  makeInteractive(container, 'window', '去窗边看雨')
  return container
}

function buildShelf(): Container {
  const container = new Container()
  container.position.set(66, 74)
  container.zIndex = 105
  container.addChild(panel(0, 0, 250, 170, 0xd8c2b1))
  const shelf = new Graphics()
  for (const y of [54, 111]) shelf.rect(12, y, 226, 7).fill({ color: 0x91665a })
  for (let index = 0; index < 18; index += 1) {
    const row = index > 8 ? 1 : 0
    const item = index > 8 ? index - 9 : index
    const colors = [0xb56c70, 0x66889b, 0x7c927d, 0xc09168]
    const height = 28 + ((index * 7) % 19)
    shelf
      .roundRect(20 + item * 23, 51 + row * 57 - height, 15, height, 2)
      .fill({ color: colors[index % colors.length] })
  }
  container.addChild(shelf)
  return container
}

function buildChair(): Container {
  const container = new Container()
  container.position.set(90, 275)
  container.zIndex = 365
  const chair = new Graphics()
    .roundRect(0, 0, 152, 126, 42)
    .fill({ color: 0xa98285 })
    .roundRect(15, 75, 122, 66, 28)
    .fill({ color: 0xc09a9b })
    .roundRect(-10, 78, 30, 72, 14)
    .fill({ color: 0x80686d })
    .roundRect(132, 78, 30, 72, 14)
    .fill({ color: 0x80686d })
  container.addChild(chair)
  makeInteractive(container, 'chair', '坐下休息')
  return container
}

function buildDiningArea(): { back: Container; front: Container } {
  const back = new Container()
  back.position.set(238, 357)
  back.zIndex = 410
  const tabletop = new Graphics()
    .ellipse(72, 48, 95, 45)
    .fill({ color: 0xa97561 })
    .stroke({ color: 0xf2c3a1, alpha: 0.42, width: 3 })
  const vase = new Graphics()
    .roundRect(59, 2, 26, 42, 10)
    .fill({ color: 0x719084 })
    .moveTo(72, 4)
    .lineTo(57, -19)
    .moveTo(72, 4)
    .lineTo(86, -25)
    .stroke({ color: 0x789b78, width: 5 })
  back.addChild(tabletop, vase)
  makeInteractive(back, 'table', '一起吃饭')

  const front = new Container()
  front.position.copyFrom(back.position)
  front.zIndex = 480
  front.addChild(
    new Graphics()
      .rect(15, 52, 12, 105)
      .fill({ color: 0x76534c })
      .rect(116, 52, 12, 105)
      .fill({ color: 0x76534c })
      .arc(72, 48, 95, 0, Math.PI)
      .stroke({ color: 0x81594f, width: 16 })
  )
  return { back, front }
}

function buildDesk(): { back: Container; front: Container } {
  const back = new Container()
  back.position.set(685, 245)
  back.zIndex = 350
  const desk = new Graphics()
    .roundRect(0, 80, 215, 24, 7)
    .fill({ color: 0xa8735e })
    .rect(20, 104, 16, 115)
    .fill({ color: 0x75534e })
    .rect(180, 104, 16, 115)
    .fill({ color: 0x75534e })
  const monitor = new Graphics()
    .roundRect(63, 0, 113, 72, 7)
    .fill({ color: 0x40536a })
    .stroke({ color: 0x807983, width: 5 })
    .rect(112, 73, 11, 12)
    .fill({ color: 0x746d76 })
    .rect(88, 84, 60, 6)
    .fill({ color: 0x746d76 })
    .roundRect(75, 13, 89, 8, 2)
    .fill({ color: 0xb8d7df, alpha: 0.72 })
    .roundRect(75, 29, 62, 5, 2)
    .fill({ color: 0xd49a9b, alpha: 0.66 })
    .roundRect(75, 42, 78, 5, 2)
    .fill({ color: 0xa7c8b2, alpha: 0.66 })
  const lamp = new Graphics()
    .circle(24, 66, 24)
    .fill({ color: 0xffc883, alpha: 0.2 })
    .moveTo(27, 81)
    .lineTo(44, 19)
    .stroke({ color: 0x80685f, width: 6 })
    .moveTo(44, 20)
    .lineTo(19, 5)
    .stroke({ color: 0x80685f, width: 6 })
    .poly([7, 0, 39, 0, 30, 20, 14, 20])
    .fill({ color: 0xc58d6f })
  back.addChild(desk, monitor, lamp)
  makeInteractive(back, 'desk', '去书桌学习')

  const front = new Container()
  front.position.copyFrom(back.position)
  front.zIndex = 425
  front.addChild(
    new Graphics()
      .roundRect(-3, 85, 221, 25, 7)
      .fill({ color: 0x946453 })
      .rect(20, 108, 16, 111)
      .fill({ color: 0x684a47 })
      .rect(180, 108, 16, 111)
      .fill({ color: 0x684a47 })
  )
  return { back, front }
}

function buildPlant(): Container {
  const plant = new Container()
  plant.position.set(880, 350)
  plant.zIndex = 520
  const drawing = new Graphics()
    .roundRect(-30, 82, 62, 72, 17)
    .fill({ color: 0x9b7771 })
    .moveTo(0, 91)
    .lineTo(-12, 8)
    .moveTo(0, 88)
    .lineTo(25, 18)
    .moveTo(-4, 87)
    .lineTo(-35, 37)
    .stroke({ color: 0x66846d, width: 7 })
    .ellipse(-26, 30, 29, 13)
    .fill({ color: 0x75957c })
    .ellipse(19, 20, 32, 14)
    .fill({ color: 0x89a388 })
    .ellipse(-5, 7, 28, 12)
    .fill({ color: 0x66876d })
  plant.addChild(drawing)
  return plant
}

function buildActivityProp(kind: 'book' | 'bowl' | 'thought' | 'speech'): Container {
  const container = new Container()
  if (kind === 'book') {
    container.addChild(
      new Graphics()
        .poly([-38, -6, -2, 3, -2, 30, -40, 20])
        .fill({ color: 0x8a6570 })
        .poly([2, 3, 38, -6, 40, 20, 2, 30])
        .fill({ color: 0x6b7992 })
    )
    container.position.set(0, -58)
  } else if (kind === 'bowl') {
    container.addChild(
      new Graphics()
        .arc(0, 0, 30, 0, Math.PI)
        .fill({ color: 0xd6b99d })
        .moveTo(-20, -10)
        .lineTo(16, -28)
        .stroke({ color: 0x76584d, width: 4 })
    )
    container.position.set(0, -55)
  } else {
    const bubble = new Graphics()
      .roundRect(-30, -28, 60, 45, 19)
      .fill({ color: 0xf1ecf4, alpha: 0.92 })
    const glyph = label(kind === 'thought' ? '…' : '♪', -11, -25, 24, 0x635b74)
    container.addChild(bubble, glyph)
    container.position.set(kind === 'thought' ? 56 : 52, -165)
  }
  container.visible = false
  return container
}

function buildCharacter(): Container {
  const root = new Container()
  root.zIndex = ROOM_ANCHORS.home.position.y
  shadow = new Graphics().ellipse(0, 2, 50, 14).fill({ color: 0x6c4b50, alpha: 0.22 })

  body = new Container()
  leftLeg = new Graphics()
    .roundRect(-27, -45, 22, 51, 9)
    .fill({ color: 0x4c3942 })
    .roundRect(-29, -6, 27, 11, 5)
    .fill({ color: 0x342d37 })
  rightLeg = new Graphics()
    .roundRect(5, -45, 22, 51, 9)
    .fill({ color: 0x4c3942 })
    .roundRect(2, -6, 27, 11, 5)
    .fill({ color: 0x342d37 })
  const coatBack = new Graphics()
    .roundRect(-49, -116, 98, 91, 30)
    .fill({ color: 0xc99662 })
    .poly([-43, -87, 43, -87, 57, -25, -57, -25])
    .fill({ color: 0xb98457 })
  const shirt = new Graphics()
    .roundRect(-36, -109, 72, 70, 23)
    .fill({ color: 0xfff8ed })
    .poly([-36, -43, 36, -43, 42, -25, -42, -25])
    .fill({ color: 0x3c3540 })
  const collarAndTie = new Graphics()
    .poly([-24, -105, -4, -92, -17, -79])
    .fill({ color: 0xffffff })
    .poly([24, -105, 4, -92, 17, -79])
    .fill({ color: 0xffffff })
    .poly([-5, -94, 5, -94, 10, -57, 0, -48, -10, -57])
    .fill({ color: 0xb9413f })
  const belt = new Graphics()
    .roundRect(-42, -43, 84, 8, 4)
    .fill({ color: 0x282831 })
    .roundRect(-7, -45, 14, 12, 3)
    .fill({ color: 0xc6a064 })
  const leftArm = new Graphics()
    .roundRect(-57, -105, 23, 73, 11)
    .fill({ color: 0xc99662 })
    .roundRect(-55, -40, 19, 18, 9)
    .fill({ color: 0xf1c8b7 })
  const rightArm = new Graphics()
    .roundRect(34, -105, 23, 73, 11)
    .fill({ color: 0xc99662 })
    .roundRect(36, -40, 19, 18, 9)
    .fill({ color: 0xf1c8b7 })
  body.addChild(leftLeg, rightLeg, coatBack, shirt, collarAndTie, belt, leftArm, rightArm)

  face = new Container()
  face.position.set(0, -144)
  const backHair = new Graphics()
    .ellipse(0, 2, 65, 69)
    .fill({ color: 0x9f3835 })
    .roundRect(-57, 10, 24, 123, 12)
    .fill({ color: 0x8e302f })
    .roundRect(33, 10, 24, 123, 12)
    .fill({ color: 0x8e302f })
    .ellipse(-35, 91, 17, 57)
    .fill({ color: 0xa93f39 })
    .ellipse(35, 91, 17, 57)
    .fill({ color: 0xa93f39 })
  const head = new Graphics().ellipse(0, 4, 48, 51).fill({ color: 0xf3cabc })
  const fringe = new Graphics()
    .arc(0, -3, 52, Math.PI, Math.PI * 2)
    .fill({ color: 0xb5443d })
    .poly([-48, -8, -14, -38, -5, 4, -18, 23])
    .fill({ color: 0xb5443d })
    .poly([-7, -41, 23, -35, 9, 16, -2, 1])
    .fill({ color: 0xa83b37 })
    .ellipse(-35, 4, 15, 43)
    .fill({ color: 0xa83b37 })
    .ellipse(36, 5, 16, 44)
    .fill({ color: 0xa83b37 })
  const eyes = new Graphics()
    .moveTo(-28, 2)
    .lineTo(-9, 0)
    .moveTo(9, 0)
    .lineTo(28, 2)
    .stroke({ color: 0x713a3d, width: 2 })
    .ellipse(-17, 10, 7, 9)
    .fill({ color: 0x5489c4 })
    .ellipse(17, 10, 7, 9)
    .fill({ color: 0x5489c4 })
    .circle(-15, 7, 2.2)
    .fill({ color: 0xd9efff, alpha: 0.92 })
    .circle(19, 7, 2.2)
    .fill({ color: 0xd9efff, alpha: 0.92 })
    .moveTo(-5, 27)
    .lineTo(5, 27)
    .stroke({ color: 0xa56363, width: 2 })
  face.addChild(backHair, head, fringe, eyes)

  book = buildActivityProp('book')
  bowl = buildActivityProp('bowl')
  thought = buildActivityProp('thought')
  speech = buildActivityProp('speech')
  sleep = label('z Z', 42, -195, 18, 0x9d6f86)
  sleep.visible = false
  root.addChild(shadow, body, face, book, bowl, thought, speech, sleep)
  return root
}

function buildWorld(): Container {
  const root = new Container()
  root.sortableChildren = true
  root.eventMode = 'static'
  root.hitArea = new Rectangle(0, 0, ROOM_WIDTH, ROOM_HEIGHT)

  const background = new Graphics()
    .rect(0, 0, ROOM_WIDTH, ROOM_HEIGHT)
    .fill({ color: 0xd9c7bd })
    .rect(0, 0, ROOM_WIDTH, 330)
    .fill({ color: 0xeadfd6 })
    .poly([0, 330, ROOM_WIDTH, 330, ROOM_WIDTH, ROOM_HEIGHT, 0, ROOM_HEIGHT])
    .fill({ color: 0x8f6d68 })
  background.zIndex = 0
  const warmLight = new Graphics()
    .circle(150, 250, 210)
    .fill({ color: 0xffd6a0, alpha: 0.12 })
    .circle(756, 292, 250)
    .fill({ color: 0xffc98c, alpha: 0.09 })
  warmLight.zIndex = 4
  const wallTrim = new Graphics()
    .rect(0, 319, ROOM_WIDTH, 15)
    .fill({ color: 0xb68f80 })
    .rect(0, 331, ROOM_WIDTH, 5)
    .fill({ color: 0x7e5e5c })
  wallTrim.zIndex = 10
  const floorLines = new Graphics()
  for (let x = -160; x < ROOM_WIDTH + 160; x += 86) {
    floorLines
      .moveTo(x, ROOM_HEIGHT)
      .lineTo(x + 145, 330)
      .stroke({ color: 0xf1c9b1, alpha: 0.14, width: 2 })
  }
  for (let y = 370; y < ROOM_HEIGHT; y += 56) {
    floorLines.moveTo(0, y).lineTo(ROOM_WIDTH, y).stroke({ color: 0x624a4d, alpha: 0.12, width: 2 })
  }
  floorLines.zIndex = 15
  const rug = new Graphics()
    .ellipse(516, 483, 283, 112)
    .fill({ color: 0xc59a9a, alpha: 0.72 })
    .ellipse(516, 483, 250, 88)
    .stroke({ color: 0xffd5c2, alpha: 0.34, width: 7 })
  rug.zIndex = 20
  rug.eventMode = 'static'
  rug.cursor = 'crosshair'
  rug.on('pointertap', (event: FederatedPointerEvent) => {
    if (!world) return
    const point = event.getLocalPosition(world)
    machine.requestMove({ x: point.x, y: point.y })
  })

  root.addChild(
    background,
    warmLight,
    wallTrim,
    floorLines,
    rug,
    buildWindow(),
    buildShelf(),
    buildChair()
  )
  const dining = buildDiningArea()
  const desk = buildDesk()
  root.addChild(dining.back, desk.back)
  character = buildCharacter()
  root.addChild(character, desk.front, dining.front, buildPlant())

  const roomTitle = label('雨夜公寓 · Q 版场景原型', 31, 592, 12, 0xf1ded2)
  roomTitle.zIndex = 900
  root.addChild(roomTitle)
  return root
}

function updateViewport(): void {
  if (!app || !world) return
  const width = Math.max(1, props.width)
  const height = Math.max(1, props.height)
  app.renderer.resize(width, height)
  const scale = Math.min(width / ROOM_WIDTH, height / ROOM_HEIGHT)
  world.scale.set(scale)
  world.position.set((width - ROOM_WIDTH * scale) / 2, (height - ROOM_HEIGHT * scale) / 2)
}

function applyCharacterState(snapshot: RoomCharacterSnapshot, deltaMs: number): void {
  if (!character || !body || !face || !shadow || !leftLeg || !rightLeg) return
  elapsed += deltaMs
  character.position.set(snapshot.position.x, snapshot.position.y)
  character.zIndex = Math.round(snapshot.position.y)
  character.scale.x = snapshot.facing === 'left' ? -0.78 : 0.78
  character.scale.y = 0.78

  const walking = snapshot.action === 'walk'
  const seated = ['studying', 'eating', 'resting', 'sit'].includes(snapshot.action)
  const bob = walking ? Math.sin(elapsed / 75) * 4 : Math.sin(elapsed / 650) * 1.7
  body.position.y = bob + (seated ? 13 : 0)
  face.position.y = -144 + bob + (seated ? 13 : 0)
  face.rotation = snapshot.action === 'look-around' ? Math.sin(elapsed / 520) * 0.1 : 0
  leftLeg.rotation = walking ? Math.sin(elapsed / 90) * 0.34 : 0
  rightLeg.rotation = walking ? -Math.sin(elapsed / 90) * 0.34 : 0
  shadow.scale.x = walking ? 0.92 + Math.sin(elapsed / 90) * 0.04 : seated ? 1.12 : 1
  shadow.alpha = seated ? 0.25 : 0.34
  if (book) book.visible = snapshot.action === 'studying'
  if (bowl) bowl.visible = snapshot.action === 'eating'
  if (thought) thought.visible = snapshot.action === 'thinking'
  if (speech) speech.visible = snapshot.action === 'speaking'
  if (sleep) {
    sleep.visible = snapshot.action === 'resting'
    sleep.alpha = 0.55 + Math.sin(elapsed / 430) * 0.25
  }

  if (lastAction !== snapshot.action) {
    lastAction = snapshot.action
    emit('status', {
      action: snapshot.action,
      label: ACTION_LABELS[snapshot.action],
      anchorId: snapshot.targetAnchorId
    })
  }
}

function scheduleNextAmbient(now = Date.now()): void {
  ambientDueAt = now + 22_000 + Math.random() * 24_000
  ambientEndsAt = 0
}

function updateAmbient(now: number, snapshot: RoomCharacterSnapshot): void {
  if (
    props.context !== 'free' ||
    props.conversationState !== 'idle' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    ambientEndsAt = 0
    scheduleNextAmbient(now)
    return
  }
  if (ambientEndsAt > 0) {
    if (snapshot.activeIntentId !== 'ambient:look-around') {
      scheduleNextAmbient(now)
    } else if (now >= ambientEndsAt) {
      machine.requestContext('free', now)
      scheduleNextAmbient(now)
    }
    return
  }
  if (now >= ambientDueAt && snapshot.action === 'idle') {
    const accepted = machine.request(
      {
        id: 'ambient:look-around',
        action: 'look-around',
        priority: 10,
        lockForMs: 2800
      },
      now
    )
    if (accepted) ambientEndsAt = now + 2800
    else scheduleNextAmbient(now)
  }
}

onMounted(async () => {
  if (!host.value) return
  const nextApp = new Application()
  app = nextApp
  await nextApp.init({
    width: props.width,
    height: props.height,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1)
  })
  if (isDisposed || !host.value) {
    nextApp.destroy({ removeView: true })
    if (app === nextApp) app = undefined
    return
  }
  isInitialized = true
  host.value.appendChild(nextApp.canvas)
  world = buildWorld()
  nextApp.stage.addChild(world)
  updateViewport()
  machine.requestContext(props.context)
  machine.setConversationState(props.conversationState)
  scheduleNextAmbient()
  tickerUpdate = (ticker): void => {
    const snapshot = machine.update(ticker.deltaMS)
    updateAmbient(Date.now(), snapshot)
    applyCharacterState(snapshot, ticker.deltaMS)
  }
  nextApp.ticker.add(tickerUpdate)
  resizeObserver = new ResizeObserver(updateViewport)
  resizeObserver.observe(host.value)
  emit('ready')
})

watch(
  () => [props.width, props.height] as const,
  () => updateViewport()
)

watch(
  () => props.context,
  (context) => machine.requestContext(context)
)

watch(
  () => props.conversationState,
  (state) => {
    machine.setConversationState(state)
    if (state === 'idle') machine.requestContext(props.context)
  }
)

onBeforeUnmount(() => {
  isDisposed = true
  resizeObserver?.disconnect()
  resizeObserver = undefined
  const currentApp = app
  app = undefined
  if (!currentApp || !isInitialized) return
  currentApp.ticker.stop()
  if (tickerUpdate) currentApp.ticker.remove(tickerUpdate)
  tickerUpdate = undefined
  currentApp.stage.removeChildren()
  currentApp.destroy({ removeView: true })
  isInitialized = false
  world = undefined
  character = undefined
})
</script>

<template>
  <div ref="host" class="room-scene-canvas" :aria-label="`${companionName} 的可互动陪伴房间`"></div>
</template>
