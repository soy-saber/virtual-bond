<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'custom'

interface ProviderSettingsView {
  provider: ProviderKind
  name: string
  baseUrl: string
  model: string
  systemPrompt: string
  source: string
  updatedAt: string
  apiKeyPresent: boolean
  apiKeyHint: string
}

const emit = defineEmits<{ close: []; updated: [] }>()
const isLoading = ref(true)
const isSaving = ref(false)
const notice = ref('')
const error = ref('')
const apiKey = ref('')
const importText = ref('')
const petScale = ref(0.75)
const current = ref<ProviderSettingsView>()
const form = reactive({
  provider: 'openai' as ProviderKind,
  name: '',
  baseUrl: '',
  model: '',
  systemPrompt: ''
})

const providerNote = computed(() => {
  switch (form.provider) {
    case 'openai':
      return '使用 OpenAI Responses API，适合官方 OpenAI 地址及兼容 Responses 的代理。'
    case 'anthropic':
      return '使用 Anthropic Messages API，可导入 CCSwitch 的 Claude 配置。'
    case 'gemini':
      return '使用 Gemini streamGenerateContent 接口。'
    case 'custom':
      return '使用 OpenAI Chat Completions 兼容协议，适合大多数自定义中转服务。'
  }
  return ''
})

function applySettings(settings: ProviderSettingsView): void {
  current.value = settings
  form.provider = settings.provider
  form.name = settings.name
  form.baseUrl = settings.baseUrl
  form.model = settings.model
  form.systemPrompt = settings.systemPrompt
  apiKey.value = ''
  emit('updated')
}

function clearMessages(): void {
  notice.value = ''
  error.value = ''
}

function applyProviderDefaults(): void {
  if (form.provider === 'openai') {
    form.baseUrl = 'https://api.openai.com/v1'
    form.model = 'gpt-5.6-luna'
  } else if (form.provider === 'anthropic') {
    form.baseUrl = 'https://api.anthropic.com/v1'
    form.model = ''
  } else if (form.provider === 'gemini') {
    form.baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
    form.model = ''
  } else {
    form.baseUrl = ''
    form.model = ''
  }
}

async function loadSettings(): Promise<void> {
  clearMessages()
  try {
    const [settings, scale] = await Promise.all([
      window.api.settings.get(),
      window.api.window.getPetScale()
    ])
    applySettings(settings)
    petScale.value = scale
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : '无法读取设置'
  } finally {
    isLoading.value = false
  }
}

async function updatePetScale(): Promise<void> {
  clearMessages()
  try {
    petScale.value = await window.api.window.setPetScale(petScale.value)
    notice.value = `桌宠尺寸已调整为 ${Math.round(petScale.value * 100)}%`
  } catch (scaleError) {
    error.value = scaleError instanceof Error ? scaleError.message : '调整桌宠尺寸失败'
  }
}

async function saveSettings(): Promise<void> {
  clearMessages()
  isSaving.value = true
  try {
    const payload: {
      provider: ProviderKind
      name: string
      baseUrl: string
      model: string
      systemPrompt: string
      apiKey?: string
    } = { ...form }
    if (apiKey.value.trim()) payload.apiKey = apiKey.value.trim()
    applySettings(await window.api.settings.save(payload))
    notice.value = '设置已安全保存'
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : '保存失败'
  } finally {
    isSaving.value = false
  }
}

async function importFromCcswitch(): Promise<void> {
  clearMessages()
  isSaving.value = true
  try {
    applySettings(await window.api.settings.importCcswitch(form.provider))
    notice.value = `已导入 CCSwitch 当前 ${form.provider} 配置`
  } catch (importError) {
    error.value = importError instanceof Error ? importError.message : 'CCSwitch 导入失败'
  } finally {
    isSaving.value = false
  }
}

async function importFromText(): Promise<void> {
  clearMessages()
  isSaving.value = true
  try {
    applySettings(await window.api.settings.importText(importText.value))
    importText.value = ''
    notice.value = '复制的配置已导入'
  } catch (importError) {
    error.value = importError instanceof Error ? importError.message : '配置导入失败'
  } finally {
    isSaving.value = false
  }
}

async function clearApiKey(): Promise<void> {
  clearMessages()
  try {
    applySettings(await window.api.settings.clearApiKey())
    notice.value = 'API Key 已清除'
  } catch (clearError) {
    error.value = clearError instanceof Error ? clearError.message : '清除失败'
  }
}

async function resetSettings(): Promise<void> {
  clearMessages()
  try {
    applySettings(await window.api.settings.reset())
    notice.value = '已恢复默认设置'
  } catch (resetError) {
    error.value = resetError instanceof Error ? resetError.message : '重置失败'
  }
}

async function copyExport(): Promise<void> {
  clearMessages()
  try {
    const exported = await window.api.settings.export()
    await navigator.clipboard.writeText(exported)
    notice.value = '不含密钥的配置已复制'
  } catch (copyError) {
    error.value = copyError instanceof Error ? copyError.message : '复制失败'
  }
}

onMounted(loadSettings)
</script>

<template>
  <div class="settings-backdrop" @mousedown.self="emit('close')">
    <section class="settings-panel" aria-label="模型设置">
      <header class="settings-header">
        <div>
          <span class="eyebrow">MODEL CONNECTION</span>
          <h2>模型与 API</h2>
        </div>
        <button aria-label="关闭设置" @click="emit('close')">×</button>
      </header>

      <div v-if="isLoading" class="settings-loading">正在读取安全设置……</div>
      <div v-else class="settings-content">
        <section class="pet-display-settings">
          <div class="setting-title-row">
            <div>
              <span class="eyebrow">PET DISPLAY</span>
              <h3>桌宠尺寸</h3>
            </div>
            <strong>{{ Math.round(petScale * 100) }}%</strong>
          </div>
          <input
            v-model.number="petScale"
            type="range"
            min="0.45"
            max="1.2"
            step="0.05"
            aria-label="桌宠显示比例"
            @change="updatePetScale"
          />
          <small>窗口、角色、气泡和点击区域会保持同一比例，重启后继续生效。</small>
        </section>

        <div class="settings-grid">
          <label>
            <span>Provider</span>
            <select v-model="form.provider" @change="applyProviderDefaults">
              <option value="openai">OpenAI Responses</option>
              <option value="anthropic">Claude / Anthropic</option>
              <option value="gemini">Google Gemini</option>
              <option value="custom">自定义 OpenAI 兼容 API</option>
            </select>
          </label>
          <label>
            <span>配置名称</span>
            <input v-model="form.name" maxlength="80" placeholder="例如：日常对话" />
          </label>
        </div>

        <p class="provider-note">{{ providerNote }}</p>

        <label>
          <span>API 地址</span>
          <input
            v-model="form.baseUrl"
            spellcheck="false"
            placeholder="https://api.example.com/v1"
          />
        </label>
        <label>
          <span>模型名称</span>
          <input v-model="form.model" spellcheck="false" placeholder="填写服务提供的模型 ID" />
        </label>
        <label>
          <span>API Key</span>
          <input
            v-model="apiKey"
            type="password"
            autocomplete="off"
            spellcheck="false"
            :placeholder="
              current?.apiKeyPresent ? `${current.apiKeyHint}（留空则不修改）` : '尚未保存密钥'
            "
          />
        </label>
        <div class="secret-status">
          <span :class="{ ready: current?.apiKeyPresent }">
            {{ current?.apiKeyPresent ? `已加密保存 ${current.apiKeyHint}` : '未配置 API Key' }}
          </span>
          <button v-if="current?.apiKeyPresent" @click="clearApiKey">清除密钥</button>
        </div>
        <label>
          <span>角色附加指令</span>
          <textarea
            v-model="form.systemPrompt"
            rows="4"
            maxlength="6000"
            placeholder="可选：补充角色性格、边界和表达偏好"
          ></textarea>
        </label>

        <div class="settings-actions primary-actions">
          <button class="primary" :disabled="isSaving" @click="saveSettings">
            {{ isSaving ? '处理中……' : '保存设置' }}
          </button>
          <button :disabled="isSaving" @click="importFromCcswitch">从 CCSwitch 导入</button>
          <button @click="copyExport">复制配置</button>
          <button @click="resetSettings">恢复默认</button>
        </div>

        <details class="import-box">
          <summary>从 CCSwitch 链接或复制内容导入</summary>
          <textarea
            v-model="importText"
            rows="4"
            spellcheck="false"
            placeholder="粘贴 ccswitch:// 链接、CCSwitch JSON，或 Virtual Bond 导出的 JSON"
          ></textarea>
          <button :disabled="!importText.trim() || isSaving" @click="importFromText">
            导入粘贴内容
          </button>
        </details>

        <p v-if="notice" class="settings-notice">{{ notice }}</p>
        <p v-if="error" class="settings-error">{{ error }}</p>
        <small v-if="current" class="settings-source">
          当前来源：{{ current.source }} · 更新于
          {{ new Date(current.updatedAt).toLocaleString('zh-CN') }}
        </small>
      </div>
    </section>
  </div>
</template>
