import OpenAI from 'openai'
import type { CharacterRecord, MessageRecord } from './database'
import type { ProviderRuntimeSettings } from './provider-settings'

export interface StreamChatOptions {
  settings: ProviderRuntimeSettings
  character: CharacterRecord
  messages: MessageRecord[]
  signal: AbortSignal
  onDelta: (delta: string) => void
}

class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ProviderHttpError'
  }
}

const DEFAULT_SYSTEM_PROMPT = `你是用户长期相处的数字伙伴。保持真诚、自然、有自己的观点，不刻意讨好，也不要假装自己是人类。
优先回应用户此刻真正表达的内容；除非确有帮助，不要把每次交流都变成长篇建议或连续提问。
你可以温柔、幽默和有边界感，但不要声称拥有现实世界中未发生的经历。`

function buildSystemPrompt(character: CharacterRecord, customPrompt: string): string {
  const characterContext = `你的名字是${character.name}。当前状态：${character.status}。当前心情：${character.mood}。`
  return [DEFAULT_SYSTEM_PROMPT, characterContext, customPrompt.trim()].filter(Boolean).join('\n\n')
}

function toOpenAiMessages(messages: MessageRecord[]): Array<{
  role: 'assistant' | 'user'
  content: string
}> {
  return messages
    .filter(
      (message) =>
        message.status !== 'failed' &&
        message.status !== 'sending' &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      role: message.role === 'companion' ? 'assistant' : 'user',
      content: message.content
    }))
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

async function streamOpenAiResponses(options: StreamChatOptions): Promise<void> {
  const client = new OpenAI({
    apiKey: options.settings.apiKey,
    baseURL: normalizeBaseUrl(options.settings.baseUrl),
    timeout: 90_000
  })
  const stream = await client.responses.create(
    {
      model: options.settings.model,
      instructions: buildSystemPrompt(options.character, options.settings.systemPrompt),
      input: toOpenAiMessages(options.messages),
      stream: true,
      store: false
    },
    { signal: options.signal }
  )

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta' && event.delta) {
      options.onDelta(event.delta)
    } else if (event.type === 'response.refusal.delta' && event.delta) {
      options.onDelta(event.delta)
    } else if (event.type === 'error') {
      throw new Error(event.message || 'OpenAI 流式响应失败')
    } else if (event.type === 'response.failed') {
      throw new Error(event.response.error?.message || 'OpenAI 响应失败')
    }
  }
}

async function streamOpenAiChatCompletions(options: StreamChatOptions): Promise<void> {
  const client = new OpenAI({
    apiKey: options.settings.apiKey,
    baseURL: normalizeBaseUrl(options.settings.baseUrl),
    timeout: 90_000
  })
  const stream = await client.chat.completions.create(
    {
      model: options.settings.model,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(options.character, options.settings.systemPrompt)
        },
        ...toOpenAiMessages(options.messages)
      ],
      stream: true
    },
    { signal: options.signal }
  )

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta.content
    if (typeof delta === 'string' && delta) options.onDelta(delta)
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  const nested = record.error
  if (nested && typeof nested === 'object') {
    const message = (nested as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim()
  return fallback
}

async function assertSuccessfulResponse(response: Response, providerName: string): Promise<void> {
  if (response.ok) return
  let message = `${providerName} 请求失败（HTTP ${response.status}）`
  try {
    message = readErrorMessage(await response.json(), message)
  } catch {
    // Keep the status-based message when the upstream body is not JSON.
  }
  throw new ProviderHttpError(response.status, message)
}

async function* readServerSentEvents(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error('服务未返回可读取的流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) yield data
    }

    if (done) break
  }

  if (buffer.trim()) {
    const data = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data) yield data
  }
}

async function streamAnthropic(options: StreamChatOptions): Promise<void> {
  const baseUrl = normalizeBaseUrl(options.settings.baseUrl)
  const isOfficialEndpoint = new URL(baseUrl).hostname === 'api.anthropic.com'
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': options.settings.apiKey,
    'anthropic-version': '2023-06-01'
  }
  if (!isOfficialEndpoint) headers.authorization = `Bearer ${options.settings.apiKey}`

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.settings.model,
      max_tokens: 2048,
      system: buildSystemPrompt(options.character, options.settings.systemPrompt),
      messages: toOpenAiMessages(options.messages),
      stream: true
    }),
    signal: options.signal
  })
  await assertSuccessfulResponse(response, 'Claude')

  for await (const data of readServerSentEvents(response)) {
    if (data === '[DONE]') break
    const event = JSON.parse(data) as Record<string, unknown>
    if (event.type === 'error') throw new Error(readErrorMessage(event, 'Claude 流式响应失败'))
    if (event.type !== 'content_block_delta') continue
    const delta = event.delta
    if (delta && typeof delta === 'object') {
      const text = (delta as Record<string, unknown>).text
      if (typeof text === 'string' && text) options.onDelta(text)
    }
  }
}

async function streamGemini(options: StreamChatOptions): Promise<void> {
  const baseUrl = normalizeBaseUrl(options.settings.baseUrl)
  const endpoint = `${baseUrl}/models/${encodeURIComponent(options.settings.model)}:streamGenerateContent?alt=sse`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': options.settings.apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemPrompt(options.character, options.settings.systemPrompt) }]
      },
      contents: options.messages.map((message) => ({
        role: message.role === 'companion' ? 'model' : 'user',
        parts: [{ text: message.content }]
      }))
    }),
    signal: options.signal
  })
  await assertSuccessfulResponse(response, 'Gemini')

  for await (const data of readServerSentEvents(response)) {
    const event = JSON.parse(data) as Record<string, unknown>
    const candidates = event.candidates
    if (!Array.isArray(candidates)) continue
    const content = (candidates[0] as Record<string, unknown> | undefined)?.content
    const parts =
      content && typeof content === 'object'
        ? (content as Record<string, unknown>).parts
        : undefined
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      const text = part && typeof part === 'object' ? (part as Record<string, unknown>).text : null
      if (typeof text === 'string' && text) options.onDelta(text)
    }
  }
}

export async function streamChat(options: StreamChatOptions): Promise<void> {
  switch (options.settings.provider) {
    case 'openai':
      await streamOpenAiResponses(options)
      return
    case 'anthropic':
      await streamAnthropic(options)
      return
    case 'gemini':
      await streamGemini(options)
      return
    case 'custom':
      await streamOpenAiChatCompletions(options)
  }
}

function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) {
    return (
      error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500
    )
  }
  if (error instanceof OpenAI.APIError) {
    return (
      error.status === undefined ||
      error.status === 408 ||
      error.status === 409 ||
      error.status === 429 ||
      error.status >= 500
    )
  }
  if (error instanceof TypeError) return true
  if (!(error instanceof Error)) return false
  return /timeout|timed out|network|connection|ECONNRESET|ECONNREFUSED|fetch failed/i.test(
    error.message
  )
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const finish = (): void => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, delayMs)
    const abort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      const error = new Error('Aborted')
      error.name = 'AbortError'
      reject(error)
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

export async function streamChatWithRetry(
  options: StreamChatOptions,
  maxAttempts = 3
): Promise<void> {
  let attempt = 0
  while (attempt < maxAttempts) {
    attempt += 1
    let emittedText = false
    try {
      await streamChat({
        ...options,
        onDelta: (delta) => {
          emittedText = true
          options.onDelta(delta)
        }
      })
      return
    } catch (error) {
      if (
        options.signal.aborted ||
        emittedText ||
        attempt >= maxAttempts ||
        !isRetryableProviderError(error)
      ) {
        throw error
      }
      await waitForRetry(attempt === 1 ? 600 : 1_500, options.signal)
    }
  }
}

export function describeProviderError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return '已停止生成'
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return 'API Key 无效或没有访问权限'
    if (error.status === 429) return '请求过于频繁或额度不足，请稍后重试'
    if (error.status && error.status >= 500) return '模型服务暂时不可用，请稍后重试'
    return error.message || '模型请求失败'
  }
  if (error instanceof ProviderHttpError) {
    if (error.status === 401 || error.status === 403) return 'API Key 无效或没有访问权限'
    if (error.status === 429) return '请求过于频繁或额度不足，请稍后重试'
    if (error.status >= 500) return '模型服务暂时不可用，请稍后重试'
    return error.message
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 300)
  return '模型请求失败，请检查 Provider 设置和网络连接'
}
