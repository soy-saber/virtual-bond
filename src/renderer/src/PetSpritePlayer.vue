<script setup lang="ts">
import 'pixi.js/unsafe-eval'
import { AnimatedSprite, Application, Assets, Rectangle, Texture } from 'pixi.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: number
    height?: number
    characterSize?: number
    footX?: number
    footY?: number
    skinId?: string
    action?: string
    motionX?: number
    motionY?: number
    rotation?: number
  }>(),
  {
    width: 360,
    height: 440,
    characterSize: 256,
    footX: 180,
    footY: 350,
    action: 'idle',
    motionX: 0,
    motionY: 0,
    rotation: 0
  }
)

type SpriteHitbox = { left: number; top: number; width: number; height: number }
type SpriteCanvas = {
  width: number
  height: number
  anchor: { x: number; y: number }
  hitbox?: { x: number; y: number; width: number; height: number }
}
type SkinAnimationAsset = Awaited<ReturnType<typeof window.api.skins.loadAnimation>>
type CachedAnimation = {
  asset: SkinAnimationAsset
  objectUrl: string
  baseTexture: Texture
  frames: Texture[]
  disposed: boolean
}

class CancelledAnimationLoad extends Error {}

const emit = defineEmits<{
  ready: [hitbox: SpriteHitbox]
  unavailable: []
  complete: [action: string]
}>()
const host = ref<HTMLDivElement>()
let app: Application | undefined
let isInitialized = false
let isDisposed = false
let sprite: AnimatedSprite | undefined
let activeSkinId = ''
let activeCanvas: SpriteCanvas | undefined
let activeAnimation: SkinAnimationAsset['animation'] | undefined
let activeEntry: CachedAnimation | undefined
let activeRequestedAction = ''
let loadSequence = 0
let cacheEpoch = 0
const animationCache = new Map<string, CachedAnimation>()
const pendingAnimations = new Map<string, Promise<CachedAnimation>>()
const SKIN_CHANGED_EVENT = 'virtual-bond:skin-changed'

function animationKey(skinId: string, action: string): string {
  return `${skinId}:${action}`
}

function disposeAnimation(entry: CachedAnimation): void {
  if (entry.disposed) return
  entry.disposed = true
  for (const frame of entry.frames) frame.destroy(false)
  void Assets.unload(entry.objectUrl)
    .catch(() => entry.baseTexture.destroy(true))
    .finally(() => URL.revokeObjectURL(entry.objectUrl))
}

function clearAnimationCache(): void {
  cacheEpoch += 1
  const entries = new Set(animationCache.values())
  animationCache.clear()
  pendingAnimations.clear()
  for (const entry of entries) disposeAnimation(entry)
}

function currentScale(): number {
  if (!activeCanvas) return 1
  return Math.min(
    props.characterSize / activeCanvas.width,
    props.characterSize / activeCanvas.height
  )
}

function applySpriteMotion(): void {
  if (!sprite || !activeCanvas || !activeAnimation) return
  const scale = currentScale()
  const anchor = activeAnimation.anchor ?? activeCanvas.anchor
  sprite.position.set(
    props.footX + (anchor.x - activeCanvas.anchor.x) * scale + props.motionX,
    props.footY + (anchor.y - activeCanvas.anchor.y) * scale + props.motionY
  )
  sprite.rotation = props.rotation
}

function applySpriteLayout(): void {
  if (!sprite || !activeCanvas || !activeAnimation) return
  const scale = currentScale()
  sprite.scale.set(scale)
  applySpriteMotion()
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

async function loadCachedAnimation(
  skinId: string,
  requestedAction: string
): Promise<CachedAnimation> {
  const requestedKey = animationKey(skinId, requestedAction)
  const cached = animationCache.get(requestedKey)
  if (cached && !cached.disposed) return cached
  const pending = pendingAnimations.get(requestedKey)
  if (pending) return pending

  const epoch = cacheEpoch
  const promise = (async (): Promise<CachedAnimation> => {
    const asset = await window.api.skins.loadAnimation(skinId, requestedAction)
    if (isDisposed || epoch !== cacheEpoch) throw new CancelledAnimationLoad()

    const canonicalKey = animationKey(skinId, asset.action)
    const canonical = animationCache.get(canonicalKey)
    if (canonical && !canonical.disposed) {
      animationCache.set(requestedKey, canonical)
      return canonical
    }

    const objectUrl = URL.createObjectURL(
      new Blob([new Uint8Array(asset.bytes).buffer], { type: asset.mimeType })
    )
    let baseTexture: Texture | undefined
    try {
      baseTexture = await Assets.load<Texture>({
        src: objectUrl,
        parser: 'texture',
        data: { scaleMode: 'linear', autoGenerateMipmaps: true }
      })
      if (isDisposed || epoch !== cacheEpoch) {
        await Assets.unload(objectUrl)
        URL.revokeObjectURL(objectUrl)
        throw new CancelledAnimationLoad()
      }

      const existing = animationCache.get(canonicalKey)
      if (existing && !existing.disposed) {
        await Assets.unload(objectUrl)
        URL.revokeObjectURL(objectUrl)
        animationCache.set(requestedKey, existing)
        return existing
      }

      const frames = Array.from({ length: asset.animation.frames }, (_, index) => {
        const column = index % asset.animation.columns
        const row = Math.floor(index / asset.animation.columns)
        return new Texture({
          source: baseTexture!.source,
          frame: new Rectangle(
            asset.animation.margin +
              column * (asset.animation.frameWidth + asset.animation.spacing),
            asset.animation.margin + row * (asset.animation.frameHeight + asset.animation.spacing),
            asset.animation.frameWidth,
            asset.animation.frameHeight
          )
        })
      })
      const entry: CachedAnimation = {
        asset,
        objectUrl,
        baseTexture,
        frames,
        disposed: false
      }
      animationCache.set(canonicalKey, entry)
      animationCache.set(requestedKey, entry)
      return entry
    } catch (error) {
      if (baseTexture && !(error instanceof CancelledAnimationLoad)) {
        await Assets.unload(objectUrl).catch(() => baseTexture?.destroy(true))
        URL.revokeObjectURL(objectUrl)
      }
      throw error
    }
  })()

  pendingAnimations.set(requestedKey, promise)
  try {
    return await promise
  } finally {
    if (pendingAnimations.get(requestedKey) === promise) pendingAnimations.delete(requestedKey)
  }
}

function applyAnimation(entry: CachedAnimation, requestedAction: string): void {
  if (!app) return
  const { asset } = entry
  activeCanvas = asset.canvas
  activeAnimation = asset.animation
  activeEntry = entry
  activeRequestedAction = requestedAction

  if (!sprite) {
    sprite = new AnimatedSprite(entry.frames)
    app.stage.addChild(sprite)
  } else {
    sprite.stop()
    sprite.onComplete = undefined
    sprite.textures = entry.frames
  }

  const anchor = asset.animation.anchor ?? asset.canvas.anchor
  sprite.anchor.set(anchor.x / asset.animation.frameWidth, anchor.y / asset.animation.frameHeight)
  sprite.roundPixels = false
  sprite.loop = asset.animation.loop
  sprite.animationSpeed = asset.animation.fps / 60
  sprite.gotoAndStop(0)
  applySpriteLayout()

  const currentSprite = sprite
  sprite.onComplete = () => {
    if (
      sprite !== currentSprite ||
      activeEntry !== entry ||
      activeRequestedAction !== requestedAction
    ) {
      return
    }
    emit('complete', requestedAction)
    const next = asset.animation.next ?? 'idle'
    if (!asset.animation.loop && next !== asset.action) {
      queueMicrotask(() => {
        if (
          sprite === currentSprite &&
          activeEntry === entry &&
          activeRequestedAction === requestedAction
        ) {
          void play(next)
        }
      })
    }
  }
  sprite.play()
}

async function play(requestedAction: string): Promise<boolean> {
  if (!app || !isInitialized || !activeSkinId) return false
  const sequence = ++loadSequence
  try {
    const entry = await loadCachedAnimation(activeSkinId, requestedAction)
    if (sequence !== loadSequence || !app || entry.disposed) return false
    applyAnimation(entry, requestedAction)
    return true
  } catch (error) {
    if (error instanceof CancelledAnimationLoad) return false
    console.warn(`Unable to play skin action ${requestedAction}`, error)
    if (requestedAction !== 'idle') return play('idle')
    emit('unavailable')
    return false
  }
}

async function preloadSkinAnimations(skinId: string): Promise<void> {
  try {
    const result = await window.api.skins.list()
    if (isDisposed || activeSkinId !== skinId) return
    const skin = result.skins.find((candidate) => candidate.manifest.id === skinId)
    if (!skin) return
    await Promise.allSettled(
      Object.keys(skin.manifest.animations).map((action) => loadCachedAnimation(skinId, action))
    )
    if (isDisposed || activeSkinId !== skinId) return
    await Promise.allSettled(
      ['pickup', 'held-idle', 'release'].map((action) => loadCachedAnimation(skinId, action))
    )
  } catch (error) {
    console.warn('Unable to preload skin animations', error)
  }
}

async function activateSkin(skinId: string): Promise<void> {
  const nextSkinId = skinId.trim()
  const changed = nextSkinId !== activeSkinId
  if (changed) {
    loadSequence += 1
    sprite?.stop()
    sprite?.destroy()
    sprite = undefined
    activeCanvas = undefined
    activeAnimation = undefined
    activeEntry = undefined
    activeRequestedAction = ''
    clearAnimationCache()
  }
  activeSkinId = nextSkinId
  if (!activeSkinId) {
    emit('unavailable')
    return
  }
  const played = await play(props.action)
  if (played) void preloadSkinAnimations(activeSkinId)
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
    console.warn('Unable to initialize skin player', error)
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
  () => props.action,
  (action) => {
    if (isInitialized && activeSkinId) void play(action)
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

watch(
  () => [props.motionX, props.motionY, props.rotation] as const,
  () => applySpriteMotion()
)

onBeforeUnmount(() => {
  isDisposed = true
  loadSequence += 1
  window.removeEventListener(SKIN_CHANGED_EVENT, handleSkinChanged)
  const currentApp = app
  app = undefined
  if (!currentApp || !isInitialized) {
    clearAnimationCache()
    return
  }
  currentApp.ticker.stop()
  sprite?.stop()
  sprite?.destroy()
  sprite = undefined
  activeEntry = undefined
  currentApp.stage.removeChildren()
  clearAnimationCache()
  currentApp.destroy({ removeView: true })
  isInitialized = false
})
</script>

<template>
  <div ref="host" class="sprite-player" aria-hidden="true"></div>
</template>
