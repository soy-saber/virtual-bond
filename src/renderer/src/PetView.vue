<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ name: string; mood: string }>()
const emit = defineEmits<{ openRoom: []; quickAction: [label: string] }>()
const isAwake = ref(false)
const isDragging = ref(false)
const showBubble = ref(true)
const bubbleText = ref('晚上好，我在这里。')
let removeSayListener: (() => void) | undefined

function say(message: string): void {
  bubbleText.value = message
  showBubble.value = true
  wake()
}

function wake(): void {
  isAwake.value = true
  showBubble.value = true
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
})

onBeforeUnmount(() => removeSayListener?.())

function openRoom(): void {
  emit('openRoom')
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) return
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
</script>

<template>
  <main class="pet-shell" @dblclick="openRoom" @contextmenu.prevent="showContextMenu">
    <div
      class="pet-drag-surface"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @mousedown="wake"
    >
      <div v-if="showBubble" class="pet-bubble">
        <span>{{ bubbleText }}</span>
        <small>{{ mood }}</small>
      </div>

      <div class="pet-aura"></div>
      <div class="pet-character" :class="{ awake: isAwake }" :aria-label="`${props.name}桌宠`">
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

    <div class="pet-controls no-drag">
      <button title="回应一下" @click="wake">✦</button>
      <button title="分享此刻" @click="shareMoment">☕</button>
      <button title="打开陪伴空间" class="open-room" @click="openRoom">
        进入空间 <span>↗</span>
      </button>
    </div>
    <button class="pet-dismiss no-drag" aria-label="隐藏提示" @click="showBubble = false">×</button>
  </main>
</template>
