import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RESTING_DRAG_MOTION,
  RESTING_DRAG_TARGET,
  dragTargetFromPointerVelocity,
  isPetDragMotionSettled,
  stepPetDragMotion
} from '../src/renderer/src/pet-drag-motion'

test('lags and tilts opposite fast pointer movement', () => {
  const target = dragTargetFromPointerVelocity(1000, -500)
  assert.equal(target.x, -24)
  assert.equal(target.y, 11)
  assert.equal(target.rotation, -0.26)
  assert.deepEqual(dragTargetFromPointerVelocity(1000, -500, true), RESTING_DRAG_TARGET)
})

test('spring motion converges back to the resting pose', () => {
  let motion = { ...RESTING_DRAG_MOTION }
  const movingTarget = dragTargetFromPointerVelocity(600, 200)
  for (let index = 0; index < 30; index += 1) {
    motion = stepPetDragMotion(motion, movingTarget, 1 / 60)
  }
  assert.ok(motion.x < -1)
  assert.ok(motion.rotation < -0.01)
  for (let index = 0; index < 180; index += 1) {
    motion = stepPetDragMotion(motion, RESTING_DRAG_TARGET, 1 / 60)
  }
  assert.equal(isPetDragMotionSettled(motion), true)
})
