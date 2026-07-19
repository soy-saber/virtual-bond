import assert from 'node:assert/strict'
import test from 'node:test'
import { readPngDimensions, validateSpriteSheet } from '../src/main/skin-assets'
import type { SkinAnimation } from '../src/main/skin-loader'

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

const animation: SkinAnimation = {
  file: 'animations/idle.png',
  frameWidth: 256,
  frameHeight: 256,
  frames: 8,
  columns: 4,
  rows: 2,
  margin: 2,
  spacing: 1,
  fps: 8,
  loop: true
}

test('reads PNG dimensions and validates a multi-row sprite sheet', () => {
  const dimensions = readPngDimensions(pngHeader(1031, 517))
  assert.deepEqual(dimensions, { width: 1031, height: 517 })
  assert.doesNotThrow(() => validateSpriteSheet(dimensions, animation))
})

test('rejects invalid PNG data and mismatched sprite sheet dimensions', () => {
  assert.throws(() => readPngDimensions(new Uint8Array(24)), /PNG/)
  assert.throws(() => validateSpriteSheet({ width: 1024, height: 512 }, animation), /实际尺寸/)
})
