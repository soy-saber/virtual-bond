import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePetAction } from '../src/renderer/src/pet-action-state'

test('selects the highest-priority desktop pet action', () => {
  assert.equal(resolvePetAction({ isDragging: false, isSpeaking: false, isAwake: false }), 'idle')
  assert.equal(
    resolvePetAction({ isDragging: false, isSpeaking: false, isAwake: true }),
    'interaction'
  )
  assert.equal(resolvePetAction({ isDragging: false, isSpeaking: true, isAwake: true }), 'speaking')
  assert.equal(resolvePetAction({ isDragging: true, isSpeaking: true, isAwake: true }), 'dragging')
})

test('returns to speaking after a drag ends while the bubble remains visible', () => {
  assert.equal(resolvePetAction({ isDragging: true, isSpeaking: true, isAwake: false }), 'dragging')
  assert.equal(
    resolvePetAction({ isDragging: false, isSpeaking: true, isAwake: false }),
    'speaking'
  )
})
