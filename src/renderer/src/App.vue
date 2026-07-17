<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

type Message = { id: number; role: 'companion' | 'user'; content: string; time: string }

const companion = {
  name: '澄夏',
  status: '正在窗边听雨',
  relationship: '相识的第 12 天',
  mood: '安静而亲近'
}

const messages = ref<Message[]>([
  {
    id: 1,
    role: 'companion',
    content: '你回来啦。今天外面下了很久的雨，我给你留了一小块安静的时间。',
    time: '19:24'
  },
  {
    id: 2,
    role: 'user',
    content: '听起来正是我需要的。',
    time: '19:25'
  },
  {
    id: 3,
    role: 'companion',
    content: '那就先不用急着解释什么。我们可以听一会儿雨，或者你愿意的话，告诉我今天最累的那一刻。',
    time: '19:25'
  }
])
const draft = ref('')
const chatList = ref<HTMLElement>()
const isThinking = ref(false)
const canSend = computed(() => draft.value.trim().length > 0 && !isThinking.value)
const minimizeWindow = (): Promise<void> => window.api.window.minimize()
const toggleMaximizeWindow = (): Promise<boolean> => window.api.window.toggleMaximize()
const closeWindow = (): Promise<void> => window.api.window.close()

const now = (): string =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date())

async function sendMessage(): Promise<void> {
  const content = draft.value.trim()
  if (!content || isThinking.value) return
  messages.value.push({ id: Date.now(), role: 'user', content, time: now() })
  draft.value = ''
  isThinking.value = true
  await nextTick()
  chatList.value?.scrollTo({ top: chatList.value.scrollHeight, behavior: 'smooth' })

  window.setTimeout(async () => {
    messages.value.push({
      id: Date.now() + 1,
      role: 'companion',
      content:
        '我听见了。现在这里还只是我们的第一间小屋，但我会慢慢记住你在意的事，也会保留自己的想法。',
      time: now()
    })
    isThinking.value = false
    await nextTick()
    chatList.value?.scrollTo({ top: chatList.value.scrollHeight, behavior: 'smooth' })
  }, 700)
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
          <div class="bond"><span>纽带</span><strong>Lv. 3</strong></div>
          <div class="bond-track"><i></i></div>
          <small>{{ companion.relationship }}</small>
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
          <article v-for="message in messages" :key="message.id" :class="['message', message.role]">
            <div class="bubble">{{ message.content }}</div>
            <time>{{ message.time }}</time>
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
