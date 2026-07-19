<script setup lang="ts">
import 'pixi.js/unsafe-eval'
import { Application, Assets, AnimatedSprite, Rectangle, Texture } from 'pixi.js'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: number
    height?: number
    characterSize?: number
    footX?: number
    footY?: number
  }>(),
  {
    width: 360,
    height: 440,
    characterSize: 256,
    footX: 180,
    footY: 350
  }
)
const emit = defineEmits<{ ready: []; unavailable: [] }>()
const host = ref<HTMLDivElement>()
let app: Application | undefined
let isInitialized = false
let sprite: AnimatedSprite | undefined
let activeSkinId = ''
let loadSequence = 0
let objectUrl: string | undefined

async function play(requestedAction: string): Promise<boolean> {
  if (!app || !isInitialized || !activeSkinId) return false
  const sequence = ++loadSequence
  try {
    const asset = await window.api.skins.loadAnimation(activeSkinId, requestedAction)
    const nextUrl = URL.createObjectURL(
      new Blob([new Uint8Array(asset.bytes).buffer], { type: asset.mimeType })
    )
    const baseTexture = await Assets.load<Texture>({ src: nextUrl, parser: 'texture' })
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
    const scale = Math.min(
      props.characterSize / asset.canvas.width,
      props.characterSize / asset.canvas.height
    )
    sprite.scale.set(scale)
    sprite.position.set(props.footX, props.footY)
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
    emit('ready')
    return true
  } catch (error) {
    console.warn(`无法播放皮肤动作 ${requestedAction}`, error)
    if (requestedAction !== 'idle') return play('idle')
    emit('unavailable')
    return false
  }
}

defineExpose({ play })

onMounted(async () => {
  if (!host.value) return
  try {
    app = new Application()
    await app.init({
      width: props.width,
      height: props.height,
      backgroundAlpha: 0,
      antialias: true
    })
    isInitialized = true
    host.value.appendChild(app.canvas)
    const result = await window.api.skins.list()
    activeSkinId = result.skins[0]?.manifest.id ?? ''
    if (!activeSkinId || !(await play('idle'))) emit('unavailable')
  } catch (error) {
    console.warn('无法初始化皮肤播放器', error)
    emit('unavailable')
  }
})

onBeforeUnmount(() => {
  loadSequence += 1
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  if (isInitialized) app?.destroy(true, { children: true, texture: true })
})
</script>

<template>
  <div ref="host" class="sprite-player" aria-hidden="true"></div>
</template>
