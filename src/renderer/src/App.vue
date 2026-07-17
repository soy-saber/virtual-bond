<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

type Message = {
  id: string
  characterId: string
  role: 'companion' | 'user'
  content: string
  createdAt: string
}

const companion = ref({
  id: '',
  name: '澄夏',
  status: '正在窗边听雨',
  mood: '安静而亲近',
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
const canSend = computed(() => draft.value.trim().length > 0 && !isThinking.value)
const relationship = computed(() => {
  const elapsed = Date.now() - new Date(companion.value.relationshipStartedAt).getTime()
  const days = Math.max(1, Math.floor(elapsed / 86_400_000) + 1)
  return `相识的第 ${days} 天`
})
const bondProgress = computed(() => `${Math.min(companion.value.bondExperience, 100)}%`)
const minimizeWindow = (): Promise<void> => window.api.window.minimize()
const toggleMaximizeWindow = (): Promise<boolean> => window.api.window.toggleMaximize()
const closeWindow = (): Promise<void> => window.api.window.close()

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
  try {
    companion.value = await window.api.character.getDefault()
    messages.value = await window.api.conversation.list(companion.value.id)
    await scrollToLatest('auto')
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '无法加载陪伴空间'
  } finally {
    isLoading.value = false
  }
})

async function sendMessage(): Promise<void> {
  const content = draft.value.trim()
  if (!content || isThinking.value || !companion.value.id) return
  const optimisticId = `pending-${Date.now()}`
  messages.value.push({
    id: optimisticId,
    characterId: companion.value.id,
    role: 'user',
    content,
    createdAt: new Date().toISOString()
  })
  draft.value = ''
  isThinking.value = true
  await scrollToLatest()

  try {
    const result = await window.api.conversation.send(companion.value.id, content)
    const optimisticIndex = messages.value.findIndex((message) => message.id === optimisticId)
    if (optimisticIndex >= 0) messages.value.splice(optimisticIndex, 1, result.userMessage)
    messages.value.push(result.companionMessage)
  } catch (error) {
    const optimistic = messages.value.find((message) => message.id === optimisticId)
    if (optimistic) optimistic.content = `${optimistic.content}（发送失败，请重试）`
    console.error(error)
  } finally {
    isThinking.value = false
    await scrollToLatest()
  }
}
</script>

<template>
  <main class="app-shell">
    <header class="titlebar">
      <div class="brand"><span class="brand-mark">VB</span><span>虚拟纽带</span></div>
      <div class="drag-region"></div>
      <nav class="window-actions" aria-label="窗口控制">
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
            <div class="portrait">澄</div>
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

        <button class="settings"><span>⚙</span> 设置</button>
      </aside>

      <section class="stage">
        <div class="atmosphere">
          <span class="eyebrow">FRIDAY · RAINY EVENING</span>
          <h2>晚上好，<br />要一起待一会儿吗？</h2>
          <p>此刻的澄夏：{{ companion.mood }}</p>
        </div>
        <div class="character-scene" aria-label="角色展示占位">
          <div class="moon"></div>
          <div class="window-rain"></div>
          <div class="character-silhouette">
            <span class="hair"></span><span class="face"></span><span class="body"></span>
          </div>
          <div class="scene-floor"></div>
        </div>
        <div class="quick-actions">
          <button>☕ 分享此刻</button><button>◈ 今日签到</button><button>⌁ 猜个词</button>
        </div>
      </section>

      <section class="chat-panel">
        <header class="chat-header">
          <div>
            <span class="pulse"></span><strong>正在陪伴</strong
            ><small>记忆会在对话中逐渐形成</small>
          </div>
          <button aria-label="更多">•••</button>
        </header>
        <div ref="chatList" class="messages">
          <div v-if="isLoading" class="empty-state">正在打开这间小屋……</div>
          <div v-else-if="loadError" class="empty-state error">{{ loadError }}</div>
          <article v-for="message in messages" :key="message.id" :class="['message', message.role]">
            <div class="bubble">{{ message.content }}</div>
            <time>{{ formatTime(message.createdAt) }}</time>
          </article>
          <article v-if="isThinking" class="message companion">
            <div class="bubble typing"><i></i><i></i><i></i></div>
          </article>
        </div>
        <footer class="composer">
          <textarea
            v-model="draft"
            rows="1"
            placeholder="和澄夏说点什么……"
            @keydown.enter.exact.prevent="sendMessage"
          ></textarea>
          <div class="composer-tools">
            <button aria-label="添加">＋</button><span>Enter 发送</span
            ><button class="send" :disabled="!canSend" @click="sendMessage">↑</button>
          </div>
        </footer>
      </section>
    </section>
  </main>
</template>
