import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { LoadedSkin, SkinAnimation } from './skin-loader'

export interface PngDimensions {
  width: number
  height: number
}

export interface SkinAnimationAsset {
  skinId: string
  action: string
  mimeType: 'image/png'
  bytes: Uint8Array
  canvas: LoadedSkin['manifest']['canvas']
  animation: SkinAnimation
}

export function readPngDimensions(bytes: Uint8Array): PngDimensions {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error('动画资源不是有效的 PNG 文件')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width <= 0 || height <= 0) throw new Error('PNG 尺寸无效')
  return { width, height }
}

export function validateSpriteSheet(dimensions: PngDimensions, animation: SkinAnimation): void {
  const expectedWidth =
    animation.margin * 2 +
    animation.columns * animation.frameWidth +
    (animation.columns - 1) * animation.spacing
  const expectedHeight =
    animation.margin * 2 +
    animation.rows * animation.frameHeight +
    (animation.rows - 1) * animation.spacing
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new Error(
      `Sprite Sheet 实际尺寸 ${dimensions.width}×${dimensions.height}，清单要求 ${expectedWidth}×${expectedHeight}`
    )
  }
  if (animation.columns * animation.rows < animation.frames) {
    throw new Error('Sprite Sheet 网格容量小于帧数')
  }
}

export function resolveSkinAnimationAction(
  animations: Record<string, SkinAnimation>,
  requestedAction: string
): string {
  if (animations[requestedAction]) return requestedAction
  if ((requestedAction === 'pickup' || requestedAction === 'held-idle') && animations.dragging) {
    return 'dragging'
  }
  return 'idle'
}

export function loadSkinAnimationAsset(
  skin: LoadedSkin,
  requestedAction: string
): SkinAnimationAsset {
  const action = resolveSkinAnimationAction(skin.manifest.animations, requestedAction)
  const animation = skin.manifest.animations[action]
  const bytes = readFileSync(resolve(skin.directory, animation.file))
  validateSpriteSheet(readPngDimensions(bytes), animation)
  return {
    skinId: skin.manifest.id,
    action,
    mimeType: 'image/png',
    bytes: new Uint8Array(bytes),
    canvas: skin.manifest.canvas,
    animation
  }
}
