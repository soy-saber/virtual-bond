<script setup lang="ts">
import 'pixi.js/unsafe-eval'
import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Text,
  Texture,
  type Ticker
} from 'pixi.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import walkSheetUrl from '../../../resources/animation-prototypes/makise-kurisu-chibi/walk-right.png?url'
import {
  BUILDING_HEIGHT,
  BUILDING_SPACES,
  BUILDING_WIDTH,
  MultiFloorStateMachine,
  type SpaceId
} from './multi-floor-state'
import {
  ACTION_LABELS,
  type ConversationState,
  type RoomAction,
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
  status: [payload: { action: RoomAction; label: string; anchorId?: string }]
}>()

const host = ref<HTMLDivElement>()
const machine = new MultiFloorStateMachine()
let app: Application | undefined
let world: Container | undefined
let character: Container | undefined
let characterSprite: AnimatedSprite | undefined
let elevatorBack: Container | undefined
let elevatorFront: Container | undefined
let tickerUpdate: ((ticker: Ticker) => void) | undefined
let observer: ResizeObserver | undefined
let disposed = false
let lastStatusKey = ''
let lastTravelMode: 'idle' | 'walking' | 'elevator' = 'idle'

const floorColors = { roof: 0x26364b, middle: 0x2d2f43, lower: 0x352c38 } as const
const accentColors: Record<SpaceId, number> = {
  observatory: 0x7697ba,
  greenhouse: 0x73917d,
  archive: 0x8b748d,
  laboratory: 0x9a6f76,
  study: 0x8b806e,
  kitchen: 0xb48768,
  lounge: 0x9c7482,
  bedroom: 0x6f718e
}

function text(content: string, size: number, color = 0xece7ef): Text {
  return new Text({
    text: content,
    style: {
      fontFamily: "Inter, 'Microsoft YaHei', sans-serif",
      fontSize: size,
      fill: color,
      fontWeight: '600'
    }
  })
}

function buildSpace(spaceId: SpaceId): Container {
  const space = BUILDING_SPACES[spaceId]
  const room = new Container()
  room.position.set(space.bounds.x, space.bounds.y)
  room.eventMode = 'static'
  room.cursor = 'pointer'
  const shell = new Graphics()
    .roundRect(0, 0, space.bounds.width, space.bounds.height, 14)
    .fill({ color: floorColors[space.floor], alpha: 0.98 })
    .stroke({ color: accentColors[spaceId], alpha: 0.72, width: 3 })
  const floor = new Graphics()
    .rect(12, space.bounds.height - 28, space.bounds.width - 24, 16)
    .fill({ color: 0x171722, alpha: 0.72 })
  const lamp = new Graphics()
    .circle(space.bounds.width - 34, 30, 7)
    .fill({ color: accentColors[spaceId], alpha: 0.95 })
  const title = text(space.label, 22)
  title.position.set(24, 20)
  const subtitle = text(space.subtitle, 12, 0xaaa6b4)
  subtitle.position.set(24, 51)
  const furniture = new Graphics()
  if (spaceId === 'laboratory')
    furniture
      .roundRect(85, 100, 210, 55, 6)
      .fill({ color: 0x6f5360 })
      .rect(110, 65, 80, 34)
      .fill({ color: 0x536d82 })
  else if (spaceId === 'kitchen')
    furniture
      .roundRect(50, 105, 220, 52, 7)
      .fill({ color: 0x8a654f })
      .circle(110, 90, 17)
      .fill({ color: 0xd4b690 })
  else if (spaceId === 'bedroom')
    furniture
      .roundRect(46, 105, 185, 58, 18)
      .fill({ color: 0x696b88 })
      .roundRect(55, 90, 65, 28, 10)
      .fill({ color: 0xb0a9bd })
  else if (spaceId === 'lounge') furniture.roundRect(70, 105, 210, 58, 24).fill({ color: 0x825f6d })
  else if (spaceId === 'archive')
    for (let x = 40; x < space.bounds.width - 40; x += 48)
      furniture.rect(x, 88, 32, 75).fill({ color: 0x68566b })
  else if (spaceId === 'observatory')
    furniture
      .circle(space.bounds.width / 2, 125, 45)
      .stroke({ color: 0x89a9c4, width: 8 })
      .moveTo(space.bounds.width / 2, 170)
      .lineTo(space.bounds.width / 2 - 45, 185)
      .stroke({ color: 0x77788c, width: 7 })
  else if (spaceId === 'greenhouse')
    for (let x = 70; x < space.bounds.width - 40; x += 105)
      furniture
        .circle(x, 125, 34)
        .fill({ color: 0x587463 })
        .rect(x - 24, 151, 48, 25)
        .fill({ color: 0x7d5e55 })
  else furniture.roundRect(45, 95, space.bounds.width - 90, 66, 12).fill({ color: 0x6f675c })
  room.addChild(shell, floor, lamp, title, subtitle, furniture)
  room.on('pointertap', () => machine.requestSpace(spaceId))
  room.on('pointerover', () => {
    shell.alpha = 0.82
  })
  room.on('pointerout', () => {
    shell.alpha = 1
  })
  return room
}

function buildCharacter(sheetTexture: Texture): Container {
  const root = new Container()
  const shadow = new Graphics().ellipse(0, 3, 37, 10).fill({ color: 0x07070b, alpha: 0.38 })
  const frames = Array.from(
    { length: 8 },
    (_, index) =>
      new Texture({
        source: sheetTexture.source,
        frame: new Rectangle((index % 4) * 384, Math.floor(index / 4) * 512, 384, 512)
      })
  )
  characterSprite = new AnimatedSprite(frames)
  characterSprite.anchor.set(0.5, 496 / 512)
  characterSprite.scale.set(0.3)
  characterSprite.animationSpeed = 8 / 60
  characterSprite.loop = true
  characterSprite.roundPixels = true
  characterSprite.gotoAndStop(0)
  root.addChild(shadow, characterSprite)
  return root
}

function buildElevator(): { back: Container; front: Container } {
  const back = new Container()
  back.zIndex = 900
  back.addChild(
    new Graphics()
      .roundRect(-56, -158, 112, 162, 14)
      .fill({ color: 0x637483, alpha: 0.22 })
      .stroke({ color: 0xaebfca, alpha: 0.56, width: 4 })
      .circle(0, -140, 17)
      .fill({ color: 0xf6d18c, alpha: 0.22 })
  )
  const front = new Container()
  front.zIndex = 1100
  front.addChild(
    new Graphics()
      .moveTo(-56, -116)
      .lineTo(-56, 4)
      .lineTo(56, 4)
      .lineTo(56, -116)
      .stroke({ color: 0x8799a6, alpha: 0.62, width: 4 })
      .moveTo(0, -116)
      .lineTo(0, 2)
      .stroke({ color: 0x8395a2, alpha: 0.48, width: 2 })
  )
  back.visible = false
  front.visible = false
  return { back, front }
}

function buildElevatorNode(y: number, floor: string, subtitle: string): Container {
  const node = new Container()
  node.position.set(600, y)
  node.zIndex = 820
  const marker = new Graphics()
    .circle(0, 0, 15)
    .fill({ color: 0x718592 })
    .stroke({ color: 0xaab8c1, alpha: 0.72, width: 2 })
    .moveTo(-26, 0)
    .lineTo(-15, 0)
    .moveTo(15, 0)
    .lineTo(26, 0)
    .stroke({ color: 0x718592, alpha: 0.62, width: 2 })
  const badge = new Graphics().roundRect(24, -21, 92, 42, 9).fill({ color: 0x242532, alpha: 0.94 })
  const floorText = text(floor, 14, 0xc9d3da)
  floorText.position.set(36, -17)
  const subtitleText = text(subtitle, 10, 0xa9a6b2)
  subtitleText.position.set(36, 1)
  node.addChild(marker, badge, floorText, subtitleText)
  return node
}

function updateViewport(): void {
  if (!app || !world) return
  app.renderer.resize(props.width, props.height)
  const scale = Math.min(props.width / BUILDING_WIDTH, props.height / BUILDING_HEIGHT)
  world.scale.set(scale)
  world.position.set(
    (props.width - BUILDING_WIDTH * scale) / 2,
    (props.height - BUILDING_HEIGHT * scale) / 2
  )
}

function buildWorld(sheetTexture: Texture): Container {
  const root = new Container()
  root.sortableChildren = true
  root.addChild(
    new Graphics().rect(0, 0, BUILDING_WIDTH, BUILDING_HEIGHT).fill({ color: 0x11131d })
  )
  const shaft = new Graphics()
    .roundRect(575, 55, 50, 790, 16)
    .fill({ color: 0x1b1d2a })
    .stroke({ color: 0x5e6172, width: 3 })
  root.addChild(shaft)
  root.addChild(
    buildElevatorNode(244, '3F', '观测层'),
    buildElevatorNode(514, '2F', '研究层'),
    buildElevatorNode(784, '1F', '生活层')
  )
  for (const id of Object.keys(BUILDING_SPACES) as SpaceId[]) root.addChild(buildSpace(id))
  const heading = text('VIRTUAL BOND · SECTIONAL HABITAT', 14, 0x8f91a2)
  heading.position.set(70, 28)
  root.addChild(heading)
  const elevator = buildElevator()
  elevatorBack = elevator.back
  elevatorFront = elevator.front
  root.addChild(elevatorBack)
  character = buildCharacter(sheetTexture)
  const initial = machine.snapshot()
  character.position.set(initial.position.x, initial.position.y)
  character.zIndex = 1000
  root.addChild(character)
  root.addChild(elevatorFront)
  return root
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
  if (disposed || !host.value) {
    nextApp.destroy({ removeView: true })
    return
  }
  host.value.appendChild(nextApp.canvas)
  const walkSheet = await Assets.load<Texture>(walkSheetUrl)
  if (disposed) {
    nextApp.destroy({ removeView: true })
    return
  }
  world = buildWorld(walkSheet)
  nextApp.stage.addChild(world)
  machine.requestContext(props.context)
  machine.setConversationState(props.conversationState)
  tickerUpdate = (ticker): void => {
    const snapshot = machine.update(ticker.deltaMS)
    if (character) {
      character.position.set(snapshot.position.x, snapshot.position.y)
      character.scale.x = snapshot.facing === 'left' ? -1 : 1
      character.alpha =
        snapshot.action === 'thinking' ? 0.78 + Math.sin(Date.now() / 220) * 0.12 : 1
    }
    if (snapshot.travelMode !== lastTravelMode) {
      lastTravelMode = snapshot.travelMode
      if (snapshot.travelMode === 'walking') characterSprite?.play()
      else characterSprite?.gotoAndStop(0)
    }
    const usingElevator = snapshot.travelMode === 'elevator'
    if (elevatorBack && elevatorFront) {
      elevatorBack.visible = usingElevator
      elevatorFront.visible = usingElevator
      elevatorBack.position.set(600, snapshot.position.y)
      elevatorFront.position.copyFrom(elevatorBack.position)
      const pulse = 0.74 + Math.sin(Date.now() / 180) * 0.12
      elevatorBack.alpha = pulse
      elevatorFront.alpha = 0.86
    }
    const statusKey = `${snapshot.action}:${snapshot.targetSpaceId}`
    if (statusKey !== lastStatusKey) {
      lastStatusKey = statusKey
      emit('status', {
        action: snapshot.action,
        label: ACTION_LABELS[snapshot.action],
        anchorId: snapshot.targetSpaceId
      })
    }
  }
  nextApp.ticker.add(tickerUpdate)
  observer = new ResizeObserver(updateViewport)
  observer.observe(host.value)
  updateViewport()
  emit('ready')
})

watch(
  () => props.context,
  (context) => machine.requestContext(context)
)
watch(
  () => props.conversationState,
  (state) => machine.setConversationState(state)
)
watch(() => [props.width, props.height] as const, updateViewport)

onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  const currentApp = app
  app = undefined
  if (!currentApp) return
  currentApp.ticker.stop()
  if (tickerUpdate) currentApp.ticker.remove(tickerUpdate)
  currentApp.stage.removeChildren()
  currentApp.destroy({ removeView: true })
  world = undefined
  character = undefined
  characterSprite = undefined
  elevatorBack = undefined
  elevatorFront = undefined
})
</script>

<template>
  <div ref="host" class="multi-floor-scene" :aria-label="`${companionName}的多层陪伴空间`"></div>
</template>
