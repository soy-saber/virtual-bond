import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeImageResponse, normalizeImageRequest } from '../src/main/image-provider-core'

test('normalizes image generation defaults and validates limits', () => {
  assert.deepEqual(normalizeImageRequest({ prompt: '  测试图片  ' }), {
    prompt: '测试图片',
    size: '1024x1024',
    quality: 'low',
    n: 1
  })
  assert.throws(() => normalizeImageRequest({ prompt: '' }), /不能为空/)
  assert.throws(() => normalizeImageRequest({ prompt: 'x', n: 6 }), /1 到 5/)
})

test('decodes base64 images and rejects unsafe download URLs', async () => {
  const decoded = await decodeImageResponse(
    { data: [{ b64_json: Buffer.from('image').toString('base64') }] },
    async () => new Uint8Array()
  )
  assert.equal(Buffer.from(decoded[0]).toString(), 'image')
  await assert.rejects(
    () => decodeImageResponse({ data: [{ url: 'file:///secret' }] }, async () => new Uint8Array()),
    /不安全/
  )
})
