<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PetView from './PetView.vue'
import RoomScene from './RoomScene.vue'
import SettingsPanel from './SettingsPanel.vue'
import type { ConversationState, RoomAction, RoomAnchorId, RoomContext } from './room-state'

type Message = {
  id: string
  characterId: string
  role: 'companion' | 'user'
  content: string
  createdAt: string
  updatedAt?: string
  status?: 'completed' | 'sending' | 'stopped' | 'failed'
  error?: string | null
  streaming?: boolean
}

type ProviderSummary = {
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom'
  model: string
  apiKeyPresent: boolean
}

const companion = ref({
  id: '',
  name: '牧濑红莉栖',
  status: '正在整理实验记录',
  mood: '冷静而专注',
  relationshipStartedAt: new Date().toISOString(),
  bondLevel: 1,
  bondExperience: 0
})

const messages = ref<Message[]>([])
const draft = ref('')
const chatList = ref<HTMLElement>()
const isThinking = ref(false)
const isLoading = ref(true)
const loadError = ref('')
const sendError = ref('')
const isRoomOpen = ref(false)
const isSettingsOpen = ref(false)
const characterScene = ref<HTMLElement>()
const roomCharacterLayout = ref({
  width: 600,
  height: 712
})
const savedRoomContext = localStorage.getItem('virtual-bond:room-context')
const roomContext = ref<RoomContext>(
  savedRoomContext === 'focus' || savedRoomContext === 'meal' || savedRoomContext === 'rest'
    ? savedRoomContext
    : 'free'
)
const roomStatus = ref<{ action: RoomAction; label: string; anchorId?: RoomAnchorId }>({
  action: 'idle',
  label: '在房间里陪着你'
})
const currentRequestId = ref('')
const providerSummary = ref<ProviderSummary>()
const canSend = computed(() => draft.value.trim().length > 0 && !isThinking.value)
const relationship = computed(() => {
  const elapsed = Date.now() - new Date(companion.value.relationshipStartedAt).getTime()
  const days = Math.max(1, Math.floor(elapsed / 86_400_000) + 1)
  return `相识的第 ${days} 天`
})
const bondProgress = computed(() => `${Math.min(companion.value.bondExperience, 100)}%`)
const roomConversationState = computed<ConversationState>(() => {
  if (!isThinking.value) return 'idle'
  const streaming = messages.value.find(
    (message) => message.id === `streaming-${currentRequestId.value}`
  )
  return streaming?.content ? 'speaking' : 'thinking'
})
const roomContextCopy: Record<
  RoomContext,
  { eyebrow: string; title: string; description: string }
> = {
  free: {
    eyebrow: 'FREE COMPANY · RAINY EVENING',
    title: '不必安排什么，\n就一起待一会儿。',
    description: '自由陪伴中，可以点击地毯或家具进行互动'
  },
  focus: {
    eyebrow: 'FOCUS WITH ME · STUDY TIME',
    title: '你专心做事，\n我在旁边查资料。',
    description: '学习情境已开启，功能层 Agent 将在后续接入'
  },
  meal: {
    eyebrow: 'MEAL TOGETHER · DINNER TIME',
    title: '先好好吃饭，\n忙碌也要暂停一下。',
    description: '用餐情境已开启，她会前往餐桌'
  },
  rest: {
    eyebrow: 'SLOW DOWN · REST TIME',
    title: '今天辛苦了，\n现在可以慢一点。',
    description: '休息情境已开启，她会在阅读椅上休息'
  }
}
const activeRoomCopy = computed(() => roomContextCopy[roomContext.value])
const roomContexts: Array<{ id: RoomContext; icon: string; label: string }> = [
  { id: 'free', icon: '✦', label: '自由陪伴' },
  { id: 'focus', icon: '⌕', label: '一起学习' },
  { id: 'meal', icon: '♨', label: '一起吃饭' },
  { id: 'rest', icon: '☾', label: '休息一下' }
]
const minimizeWindow = (): Promise<void> => window.api.window.minimize()
const toggleMaximizeWindow = (): Promise<boolean> => window.api.window.toggleMaximize()
const openRoom = async (): Promise<void> => {
  try {
    await window.api.window.setMode('room')
    isRoomOpen.value = true
  } catch (error) {
    isRoomOpen.value = false
    console.error('无法进入陪伴空间', error)
  }
}
const closeRoom = async (): Promise<void> => {
  isSettingsOpen.value = false
  isRoomOpen.value = false
  await nextTick()
  await window.api.window.setMode('pet')
}
const closeWindow = (): Promise<void> =>
  isRoomOpen.value ? closeRoom() : window.api.window.close()
let removeOpenRoomListener: (() => void) | undefined
let removeReturnToPetListener: (() => void) | undefined
let removeDeltaListener: (() => void) | undefined
let roomResizeObserver: ResizeObserver | undefined

function updateRoomCharacterLayout(): void {
  const scene = characterScene.value
  if (!scene) return
  const width = Math.max(360, Math.round(scene.clientWidth))
  const height = Math.max(520, Math.round(scene.clientHeight))
  roomCharacterLayout.value = {
    width,
    height
  }
}

async function startRoomLayoutObserver(): Promise<void> {
  await nextTick()
  roomResizeObserver?.disconnect()
  if (!characterScene.value) return
  roomResizeObserver = new ResizeObserver(updateRoomCharacterLayout)
  roomResizeObserver.observe(characterScene.value)
  updateRoomCharacterLayout()
}

watch(
  isRoomOpen,
  (open) => {
    if (open) void startRoomLayoutObserver()
    else roomResizeObserver?.disconnect()
  },
  { flush: 'post' }
)

watch(roomContext, (context) => localStorage.setItem('virtual-bond:room-context', context))

const providerStatus = computed(() => {
  if (!providerSummary.value?.apiKeyPresent) return '尚未配置模型'
  return `${providerSummary.value.provider} · ${providerSummary.value.model}`
})

const formatTime = (value: string): string =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value))

async function scrollToLatest(behavior: 'auto' | 'smooth' = 'smooth'): Promise<void> {
  await nextTick()
  chatList.value?.scrollTo({ top: chatList.value.scrollHeight, behavior })
}

onMounted(async () => {
  removeOpenRoomListener = window.api.pet.onOpenRoom(() => void openRoom())
  removeReturnToPetListener = window.api.pet.onReturnToPet(() => {
    void closeRoom()
  })
  removeDeltaListener = window.api.conversation.onDelta(({ requestId, delta }) => {
    if (requestId !== currentRequestId.value) return
    const streamingMessage = messages.value.find(
      (message) => message.id === `streaming-${requestId}`
    )
    if (streamingMessage) streamingMessage.content += delta
    void scrollToLatest()
  })
  try {
    const [loadedCompanion, settings] = await Promise.all([
      window.api.character.getDefault(),
      window.api.settings.get()
    ])
    companion.value = loadedCompanion
    providerSummary.value = settings
    messages.value = await window.api.conversation.list(companion.value.id)
    await scrollToLatest('auto')
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '无法加载陪伴空间'
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  removeOpenRoomListener?.()
  removeReturnToPetListener?.()
  removeDeltaListener?.()
  roomResizeObserver?.disconnect()
})

async function refreshProviderSummary(): Promise<void> {
  try {
    providerSummary.value = await window.api.settings.get()
  } catch (error) {
    console.error(error)
  }
}

async function stopMessage(): Promise<void> {
  if (!currentRequestId.value) return
  await window.api.conversation.stop(currentRequestId.value)
}

async function sendMessage(): Promise<void> {
  const content = draft.value.trim()
  if (!content || isThinking.value || !companion.value.id) return
  const requestId = crypto.randomUUID()
  const optimisticId = `pending-${requestId}`
  const streamingId = `streaming-${requestId}`
  currentRequestId.value = requestId
  sendError.value = ''
  messages.value.push({
    id: optimisticId,
    characterId: companion.value.id,
    role: 'user',
    content,
    status: 'completed',
    error: null,
    createdAt: new Date().toISOString()
  })
  messages.value.push({
    id: streamingId,
    characterId: companion.value.id,
    role: 'companion',
    content: '',
    status: 'sending',
    error: null,
    createdAt: new Date().toISOString(),
    streaming: true
  })
  draft.value = ''
  isThinking.value = true
  await scrollToLatest()

  try {
    const result = await window.api.conversation.send(requestId, companion.value.id, content)
    const optimisticIndex = messages.value.findIndex((message) => message.id === optimisticId)
    if (optimisticIndex >= 0) messages.value.splice(optimisticIndex, 1, result.userMessage)
    const streamingIndex = messages.value.findIndex((message) => message.id === streamingId)
    if (result.companionMessage && streamingIndex >= 0) {
      messages.value.splice(streamingIndex, 1, result.companionMessage)
    } else if (streamingIndex >= 0) {
      messages.value.splice(streamingIndex, 1)
    }
    if (result.status === 'failed') sendError.value = result.error || '模型回复失败'
    if (result.status === 'stopped') sendError.value = '已停止生成'
  } catch (error) {
    const streamingIndex = messages.value.findIndex((message) => message.id === streamingId)
    if (streamingIndex >= 0) messages.value.splice(streamingIndex, 1)
    sendError.value = error instanceof Error ? error.message : '发送失败，请重试'
  } finally {
    isThinking.value = false
    currentRequestId.value = ''
    await scrollToLatest()
  }
}
</script>

<template>
  <PetView v-if="!isRoomOpen" :name="companion.name" :mood="companion.mood" @open-room="openRoom" />

  <main v-else class="app-shell room-shell">
    <header class="titlebar">
      <div class="brand"><span class="brand-mark">VB</span><span>虚拟纽带</span></div>
      <div class="drag-region"></div>
      <nav class="window-actions" aria-label="窗口控制">
        <button aria-label="返回桌宠" @click="closeRoom">↙</button>
        <button aria-label="最小化" @click="minimizeWindow">—</button>
        <button aria-label="最大化" @click="toggleMaximizeWindow">□</button>
        <button class="close" aria-label="关闭" @click="closeWindow">×</button>
      </nav>
    </header>

    <section class="workspace">
      <aside class="sidebar">
        <div class="companion-card">
          <div class="portrait-wrap">
            <div class="halo"></div>
            <div class="portrait">红</div>
            <span class="online-dot"></span>
          </div>
          <h1>{{ companion.name }}</h1>
          <p>{{ companion.status }}</p>
          <div class="bond">
            <span>纽带</span><strong>Lv. {{ companion.bondLevel }}</strong>
          </div>
          <div class="bond-track"><i :style="{ width: bondProgress }"></i></div>
          <small>{{ relationship }}</small>
        </div>

        <nav class="main-nav">
          <button class="active"><span>✦</span>陪伴空间</button>
          <button><span>◌</span>共同记忆</button>
          <button><span>◇</span>日常记录</button>
          <button><span>♧</span>衣橱</button>
        </nav>

        <button class="settings" @click="isSettingsOpen = true"><span>⚙</span> 设置</button>
      </aside>

      <section class="stage">
        <div class="atmosphere">
          <span class="eyebrow">{{ activeRoomCopy.eyebrow }}</span>
          <h2>{{ activeRoomCopy.title }}</h2>
          <p>{{ activeRoomCopy.description }}</p>
        </div>
        <div ref="characterScene" class="character-scene room-game" aria-label="互动陪伴空间">
          <RoomScene
            class="room-game-canvas"
            :width="roomCharacterLayout.width"
            :height="roomCharacterLayout.height"
            :context="roomContext"
            :conversation-state="roomConversationState"
            :companion-name="companion.name"
            @status="roomStatus = $event"
          />
          <div class="room-status-card" aria-live="polite">
            <span class="room-status-dot"></span>
            <div>
              <strong>{{ companion.name }}</strong
              ><small>{{ roomStatus.label }}</small>
            </div>
          </div>
        </div>
        <div class="quick-actions context-actions" aria-label="选择当前情境">
          <button
            v-for="context in roomContexts"
            :key="context.id"
            :class="{ active: roomContext === context.id }"
            :aria-pressed="roomContext === context.id"
            @click="roomContext = context.id"
          >
            <span>{{ context.icon }}</span
            >{{ context.label }}
          </button>
        </div>
      </section>

      <section class="chat-panel">
        <header class="chat-header">
          <div>
            <span class="pulse"></span><strong>正在陪伴</strong><small>{{ providerStatus }}</small>
          </div>
          <button aria-label="更多">•••</button>
        </header>
        <div ref="chatList" class="messages">
          <div v-if="isLoading" class="empty-state">正在打开这间小屋……</div>
          <div v-else-if="loadError" class="empty-state error">{{ loadError }}</div>
          <article
            v-for="message in messages"
            :key="message.id"
            :class="['message', message.role, message.status]"
          >
            <div v-if="message.streaming && !message.content" class="bubble typing">
              <i></i><i></i><i></i>
            </div>
            <div
              v-else-if="!message.content && message.status === 'failed'"
              class="bubble state-bubble"
            >
              {{ message.error || '回复失败，请重新发送' }}
            </div>
            <div
              v-else-if="!message.content && message.status === 'stopped'"
              class="bubble state-bubble"
            >
              已停止生成
            </div>
            <div v-else class="bubble">{{ message.content }}</div>
            <time>{{ formatTime(message.createdAt) }}</time>
            <small v-if="message.content && message.status === 'failed'" class="message-state">
              {{ message.error || '回复在生成过程中中断' }}
            </small>
            <small v-if="message.content && message.status === 'stopped'" class="message-state">
              已停止生成
            </small>
          </article>
        </div>
        <footer class="composer">
          <p v-if="sendError" class="send-error">{{ sendError }}</p>
          <textarea
            v-model="draft"
            rows="1"
            :placeholder="`和${companion.name}说点什么……`"
            @keydown.enter.exact.prevent="sendMessage"
          ></textarea>
          <div class="composer-tools">
            <button aria-label="添加">＋</button><span>Enter 发送</span
            ><button v-if="isThinking" class="stop" title="停止生成" @click="stopMessage">■</button
            ><button v-else class="send" :disabled="!canSend" @click="sendMessage">↑</button>
          </div>
        </footer>
      </section>
    </section>
  </main>

  <SettingsPanel
    v-if="isSettingsOpen"
    @close="isSettingsOpen = false"
    @updated="refreshProviderSummary"
  />
</template>
