export type ImageQuality = 'auto' | 'low' | 'medium' | 'high' | 'hd'

export interface ImageRequest {
  prompt: string
  size?: string
  quality?: ImageQuality
  n?: number
}

export interface ImageResponseItem {
  b64_json?: string
  url?: string
}

export interface ImageResponsePayload {
  data?: ImageResponseItem[]
}

const SIZE_PATTERN = /^(auto|\d{1,4}x\d{1,4}|\d{1,2}:\d{1,2})$/

export function normalizeImageRequest(request: ImageRequest): Required<ImageRequest> {
  const prompt = request.prompt?.trim()
  if (!prompt) throw new Error('图片 Prompt 不能为空')
  if (prompt.length > 20_000) throw new Error('图片 Prompt 不能超过 20000 个字符')
  const size = request.size?.trim() || '1024x1024'
  if (!SIZE_PATTERN.test(size)) throw new Error('图片尺寸格式不正确')
  const quality = request.quality ?? 'low'
  if (!['auto', 'low', 'medium', 'high', 'hd'].includes(quality)) {
    throw new Error('图片质量参数不正确')
  }
  const n = request.n ?? 1
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('图片数量必须是 1 到 5')
  return { prompt, size, quality, n }
}

export async function decodeImageResponse(
  payload: ImageResponsePayload,
  download: (url: string) => Promise<Uint8Array>
): Promise<Uint8Array[]> {
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error('图片服务没有返回图片')
  }
  return Promise.all(
    payload.data.map(async (item) => {
      if (item.b64_json) return new Uint8Array(Buffer.from(item.b64_json, 'base64'))
      if (item.url) {
        const url = new URL(item.url)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          throw new Error('图片下载地址不安全')
        }
        return download(url.toString())
      }
      throw new Error('图片响应缺少 b64_json 或 url')
    })
  )
}
