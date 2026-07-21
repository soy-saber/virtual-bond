<script setup lang="ts">
import 'pixi.js/unsafe-eval'
import { Application, Assets, AnimatedSprite, Rectangle, Texture } from 'pixi.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: number
    height?: number
    characterSize?: number
    footX?: number
    footY?: number
    skinId?: string
  }>(),
  {
    width: 360,
    height: 440,
    characterSize: 256,
    footX: 180,
    footY: 350
  }
)
type SpriteHitbox = { left: number; top: number; width: number; height: number }
type SpriteCanvas = {
  width: number
  height: number
  anchor: { x: number; y: number }
  hitbox?: { x: number; y: number; width: number; height: number }
}

const emit = defineEmits<{ ready: [hitbox: SpriteHitbox]; unavailable: [] }>()
const host = ref<HTMLDivElement>()
let app: Application | undefined
let isInitialized = false
let isDisposed = false
let sprite: AnimatedSprite | undefined
let activeSkinId = ''
let loadSequence = 0
let objectUrl: string | undefined
let activeCanvas: SpriteCanvas | undefined
const SKIN_CHANGED_EVENT = 'virtual-bond:skin-changed'

function applySpriteLayout(): void {
  if (!sprite || !activeCanvas) return
  const scale = Math.min(
    props.characterSize / activeCanvas.width,
    props.characterSize / activeCanvas.height
  )
  sprite.scale.set(scale)
  sprite.position.set(props.footX, props.footY)
  const hitbox = activeCanvas.hitbox ?? {
    x: 0,
    y: 0,
    width: activeCanvas.width,
    height: activeCanvas.height
  }
  emit('ready', {
    left: props.footX + (hitbox.x - activeCanvas.anchor.x) * scale,
    top: props.footY + (hitbox.y - activeCanvas.anchor.y) * scale,
    width: hitbox.width * scale,
    height: hitbox.height * scale
  })
}

async function play(requestedAction: string): Promise<boolean> {
  if (!app || !isInitialized || !activeSkinId) return false
  const sequence = ++loadSequence
  try {
    const asset = await window.api.skins.loadAnimation(activeSkinId, requestedAction)
    const nextUrl = URL.createObjectURL(
      new Blob([new Uint8Array(asset.bytes).buffer], { type: asset.mimeType })
    )
    const baseTexture = await Assets.load<Texture>({
      src: nextUrl,
      parser: 'texture',
      data: { scaleMode: 'linear', autoGenerateMipmaps: true }
    })
    if (sequence !== loadSequence || !app) {
      URL.revokeObjectURL(nextUrl)
      return false
    }
    const frames = Array.from({ length: asset.animation.frames }, (_, index) => {
      const column = index % asset.animation.columns
      const row = Math.floor(index / asset.animation.columns)
      return new Texture({
        source: baseTexture.source,
        frame: new Rectangle(
          asset.animation.margin + column * (asset.animation.frameWidth + asset.animation.spacing),
          asset.animation.margin + row * (asset.animation.frameHeight + asset.animation.spacing),
          asset.animation.frameWidth,
          asset.animation.frameHeight
        )
      })
    })
    sprite?.destroy({ texture: true })
    sprite = new AnimatedSprite(frames)
    sprite.anchor.set(
      asset.canvas.anchor.x / asset.animation.frameWidth,
      asset.canvas.anchor.y / asset.animation.frameHeight
    )
    activeCanvas = asset.canvas
    applySpriteLayout()
    sprite.roundPixels = true
    sprite.loop = asset.animation.loop
    sprite.animationSpeed = asset.animation.fps / 60
    sprite.onComplete = () => {
      const next = asset.animation.next ?? 'idle'
      if (!asset.animation.loop && next !== asset.action) void play(next)
    }
    app.stage.addChild(sprite)
    sprite.play()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = nextUrl
    return true
  } catch (error) {
    console.warn(`无法播放皮肤动作 ${requestedAction}`, error)
    if (requestedAction !== 'idle') return play('idle')
    emit('unavailable')
    return false
  }
}

async function activateSkin(skinId: string): Promise<void> {
  activeSkinId = skinId.trim()
  if (!activeSkinId) {
    sprite?.destroy({ texture: true })
    sprite = undefined
    activeCanvas = undefined
    emit('unavailable')
    return
  }
  await play('idle')
}

function handleSkinChanged(event: Event): void {
  if (props.skinId) return
  const skinId = (event as CustomEvent<{ skinId?: string }>).detail?.skinId
  if (typeof skinId === 'string') void activateSkin(skinId)
}

defineExpose({ play })

onMounted(async () => {
  if (!host.value) return
  try {
    const renderResolution = Math.min(4, Math.max(3, window.devicePixelRatio * 1.5))
    const nextApp = new Application()
    app = nextApp
    await nextApp.init({
      width: props.width,
      height: props.height,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: renderResolution
    })
    if (isDisposed || !host.value) {
      nextApp.destroy({ removeView: true })
      if (app === nextApp) app = undefined
      return
    }
    nextApp.renderer.resize(props.width, props.height)
    isInitialized = true
    host.value.appendChild(nextApp.canvas)
    const initialSkinId = props.skinId?.trim() || (await window.api.skins.list()).selectedSkinId
    await activateSkin(initialSkinId)
    window.addEventListener(SKIN_CHANGED_EVENT, handleSkinChanged)
  } catch (error) {
    console.warn('无法初始化皮肤播放器', error)
    emit('unavailable')
  }
})

watch(
  () => props.skinId,
  (skinId) => {
    if (isInitialized && typeof skinId === 'string') void activateSkin(skinId)
  }
)

watch(
  () => [props.width, props.height, props.characterSize, props.footX, props.footY] as const,
  ([width, height]) => {
    if (!app || !isInitialized) return
    app.renderer.resize(width, height)
    applySpriteLayout()
  }
)

onBeforeUnmount(() => {
  isDisposed = true
  loadSequence += 1
  window.removeEventListener(SKIN_CHANGED_EVENT, handleSkinChanged)
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = undefined
  const currentApp = app
  app = undefined
  if (!currentApp || !isInitialized) return
  currentApp.ticker.stop()
  sprite?.stop()
  sprite?.destroy({ texture: true })
  sprite = undefined
  currentApp.stage.removeChildren()
  currentApp.destroy({ removeView: true })
  isInitialized = false
})
</script>

<template>
  <div ref="host" class="sprite-player" aria-hidden="true"></div>
</template>
