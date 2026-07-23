export type PetDragMotion = {
  x: number
  y: number
  rotation: number
  velocityX: number
  velocityY: number
  angularVelocity: number
}

export type PetDragMotionTarget = Pick<PetDragMotion, 'x' | 'y' | 'rotation'>

export const RESTING_DRAG_MOTION: PetDragMotion = {
  x: 0,
  y: 0,
  rotation: 0,
  velocityX: 0,
  velocityY: 0,
  angularVelocity: 0
}

export const RESTING_DRAG_TARGET: PetDragMotionTarget = { x: 0, y: 0, rotation: 0 }

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function dragTargetFromPointerVelocity(
  pointerVelocityX: number,
  pointerVelocityY: number,
  reducedMotion = false
): PetDragMotionTarget {
  if (reducedMotion) return { ...RESTING_DRAG_TARGET }
  return {
    x: clamp(-pointerVelocityX * 0.038, -24, 24),
    y: clamp(-pointerVelocityY * 0.022, -12, 12),
    rotation: clamp(-pointerVelocityX * 0.00036, -0.26, 0.26)
  }
}

function springAxis(
  value: number,
  velocity: number,
  target: number,
  deltaSeconds: number,
  stiffness: number,
  damping: number
): { value: number; velocity: number } {
  const nextVelocity =
    (velocity + (target - value) * stiffness * deltaSeconds) * Math.exp(-damping * deltaSeconds)
  return {
    value: value + nextVelocity * deltaSeconds,
    velocity: nextVelocity
  }
}

export function stepPetDragMotion(
  current: PetDragMotion,
  target: PetDragMotionTarget,
  deltaSeconds: number
): PetDragMotion {
  const delta = clamp(deltaSeconds, 0, 1 / 30)
  const horizontal = springAxis(current.x, current.velocityX, target.x, delta, 44, 8.5)
  const vertical = springAxis(current.y, current.velocityY, target.y, delta, 48, 9)
  const rotation = springAxis(
    current.rotation,
    current.angularVelocity,
    target.rotation,
    delta,
    38,
    7.5
  )
  return {
    x: horizontal.value,
    y: vertical.value,
    rotation: rotation.value,
    velocityX: horizontal.velocity,
    velocityY: vertical.velocity,
    angularVelocity: rotation.velocity
  }
}

export function isPetDragMotionSettled(motion: PetDragMotion): boolean {
  return (
    Math.abs(motion.x) < 0.08 &&
    Math.abs(motion.y) < 0.08 &&
    Math.abs(motion.rotation) < 0.001 &&
    Math.abs(motion.velocityX) < 0.08 &&
    Math.abs(motion.velocityY) < 0.08 &&
    Math.abs(motion.angularVelocity) < 0.001
  )
}
