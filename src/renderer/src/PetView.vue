<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PetSpritePlayer from './PetSpritePlayer.vue'

const props = defineProps<{ name: string; mood: string }>()
const emit = defineEmits<{ openRoom: []; quickAction: [label: string] }>()
const isAwake = ref(false)
const isDragging = ref(false)
const showBubble = ref(false)
type SpriteLoadState = 'loading' | 'ready' | 'unavailable'
const spriteLoadState = ref<SpriteLoadState>('loading')
const spritePlayer = ref<InstanceType<typeof PetSpritePlayer>>()
const modelHitArea = ref<HTMLElement>()
const controls = ref<HTMLElement>()
const dismissButton = ref<HTMLButtonElement>()
const spriteHitbox = ref({ left: 143, top: 110, width: 74, height: 240 })
const petScale = ref(0.75)
const bubbleText = ref('')
let removeSayListener: (() => void) | undefined
let mousePassthrough = false
let bubbleTimer: number | undefined

const petShellStyle = computed(() => ({
  transform: `scale(${petScale.value})`
}))

const modelHitboxStyle = computed(() => {
  const padding = 7
  return {
    left: `${spriteHitbox.value.left - padding}px`,
    top: `${spriteHitbox.value.top - padding}px`,
    width: `${spriteHitbox.value.width + padding * 2}px`,
    height: `${spriteHitbox.value.height + padding * 2}px`
  }
})

const controlsStyle = computed(() => {
  const scale = Math.max(0.45, petScale.value)
  const visualScale = Math.min(1.1, Math.max(0.72, scale))
  const characterBottom = spriteHitbox.value.top + spriteHitbox.value.height
  return {
    top: `${characterBottom + 18 / scale}px`,
    transform: `translateX(-50%) scale(${visualScale / scale})`
  }
})

function setMousePassthrough(enabled: boolean): void {
  if (mousePassthrough === enabled) return
  mousePassthrough = enabled
  window.api.window.setMousePassthrough(enabled)
}

function containsPoint(element: HTMLElement | undefined, x: number, y: number): boolean {
  if (!element) return false
  const bounds = element.getBoundingClientRect()
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
}

function containsButton(element: HTMLElement | undefined, x: number, y: number): boolean {
  return Array.from(element?.querySelectorAll('button') ?? []).some((button) =>
    containsPoint(button, x, y)
  )
}

function syncMousePassthrough(event: MouseEvent): void {
  if (isDragging.value) return setMousePassthrough(false)
  const interactive =
    containsPoint(modelHitArea.value, event.clientX, event.clientY) ||
    containsButton(controls.value, event.clientX, event.clientY) ||
    containsPoint(dismissButton.value, event.clientX, event.clientY)
  setMousePassthrough(!interactive)
}

function updateSpriteHitbox(hitbox: {
  left: number
  top: number
  width: number
  height: number
}): void {
  spriteHitbox.value = hitbox
  spriteLoadState.value = 'ready'
}

function markSpriteUnavailable(): void {
  spriteLoadState.value = 'unavailable'
  spriteHitbox.value = { left: 104, top: 140, width: 152, height: 210 }
}

function say(message: string): void {
  if (bubbleTimer) window.clearTimeout(bubbleTimer)
  bubbleText.value = message
  showBubble.value = true
  const characterCount = Array.from(message).filter((character) => !/\s/u.test(character)).length
  const displayDuration = Math.min(9000, Math.max(2400, 1200 + characterCount * 180))
  bubbleTimer = window.setTimeout(() => {
    showBubble.value = false
    bubbleTimer = undefined
  }, displayDuration)
  wake()
}

function wake(): void {
  isAwake.value = true
  void spritePlayer.value?.play('interaction')
  window.setTimeout(() => {
    isAwake.value = false
  }, 1800)
}

function shareMoment(): void {
  emit('quickAction', '分享此刻')
  say('不用急着做什么，陪我待一会儿就好。')
}

onMounted(() => {
  removeSayListener = window.api.pet.onSay(say)
  document.addEventListener('mousemove', syncMousePassthrough, { passive: true })
  void loadPetScale()
})

onBeforeUnmount(() => {
  removeSayListener?.()
  if (bubbleTimer) window.clearTimeout(bubbleTimer)
  document.removeEventListener('mousemove', syncMousePassthrough)
  setMousePassthrough(false)
})

function hideBubble(): void {
  if (bubbleTimer) window.clearTimeout(bubbleTimer)
  bubbleTimer = undefined
  showBubble.value = false
}

function openRoom(): void {
  emit('openRoom')
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  setMousePassthrough(false)
  isDragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  window.api.window.beginDrag()
}

function moveDrag(): void {
  if (!isDragging.value) return
  window.api.window.dragTo()
}

function endDrag(event: PointerEvent): void {
  if (!isDragging.value) return
  isDragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  window.api.window.endDrag()
}

function showContextMenu(): void {
  window.api.window.showContextMenu()
}

async function loadPetScale(): Promise<void> {
  try {
    petScale.value = await window.api.window.getPetScale()
  } catch {
    // Keep the default layout if the main process is not ready yet.
  }
}
</script>

<template>
  <main
    class="pet-shell"
    :style="petShellStyle"
    @dblclick="openRoom"
    @contextmenu.prevent="showContextMenu"
  >
    <div class="pet-drag-surface">
      <div
        ref="modelHitArea"
        class="pet-model-hit-area"
        :style="modelHitboxStyle"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @mousedown="wake"
      ></div>
      <Transition name="pet-bubble">
        <div v-if="showBubble" class="pet-bubble">
          <span>{{ bubbleText }}</span>
          <small>{{ mood }}</small>
        </div>
      </Transition>

      <div class="pet-aura"></div>
      <PetSpritePlayer
        ref="spritePlayer"
        class="pet-sprite-player"
        @ready="updateSpriteHitbox"
        @unavailable="markSpriteUnavailable"
      />
      <div
        v-show="spriteLoadState === 'unavailable'"
        class="pet-character"
        :class="{ awake: isAwake }"
        :aria-label="`${props.name}桌宠`"
      >
        <div class="pet-hair pet-hair-back"></div>
        <div class="pet-ear left"></div>
        <div class="pet-ear right"></div>
        <div class="pet-face">
          <i class="pet-eye left"></i><i class="pet-eye right"></i> <i class="pet-blush left"></i
          ><i class="pet-blush right"></i>
          <i class="pet-mouth"></i>
        </div>
        <div class="pet-hair pet-hair-front"></div>
        <div class="pet-neck"></div>
        <div class="pet-body">
          <i class="pet-collar"></i><i class="pet-arm left"></i><i class="pet-arm right"></i>
        </div>
      </div>
      <div class="pet-shadow"></div>
    </div>

    <div ref="controls" class="pet-controls no-drag" :style="controlsStyle">
      <button title="回应一下" @click="wake">✦</button>
      <button title="分享此刻" @click="shareMoment">☕</button>
      <button title="打开陪伴空间" class="open-room" @click="openRoom">
        进入空间 <span>↗</span>
      </button>
    </div>
    <button
      v-if="showBubble"
      ref="dismissButton"
      class="pet-dismiss no-drag"
      aria-label="隐藏提示"
      @click="hideBubble"
    >
      ×
    </button>
  </main>
</template>
