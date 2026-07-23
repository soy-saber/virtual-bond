import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePetAction } from '../src/renderer/src/pet-action-state'

test('selects the highest-priority desktop pet action', () => {
  assert.equal(resolvePetAction({ dragState: 'idle', isSpeaking: false, isAwake: false }), 'idle')
  assert.equal(
    resolvePetAction({ dragState: 'idle', isSpeaking: false, isAwake: true }),
    'interaction'
  )
  assert.equal(resolvePetAction({ dragState: 'idle', isSpeaking: true, isAwake: true }), 'speaking')
  assert.equal(resolvePetAction({ dragState: 'active', isSpeaking: true, isAwake: true }), 'pickup')
  assert.equal(
    resolvePetAction({ dragState: 'release', isSpeaking: true, isAwake: true }),
    'release'
  )
})

test('returns to speaking after a drag ends while the bubble remains visible', () => {
  assert.equal(
    resolvePetAction({ dragState: 'active', isSpeaking: true, isAwake: false }),
    'pickup'
  )
  assert.equal(
    resolvePetAction({ dragState: 'idle', isSpeaking: true, isAwake: false }),
    'speaking'
  )
})
