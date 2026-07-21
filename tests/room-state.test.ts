import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROOM_ANCHORS,
  RoomStateMachine,
  clampToWalkArea,
  createContextIntent,
  createConversationIntent
} from '../src/renderer/src/room-state'

test('clamps free movement to the trapezoid-shaped walk area', () => {
  assert.deepEqual(clampToWalkArea({ x: -100, y: 200 }), { x: 122, y: 330 })
  assert.deepEqual(clampToWalkArea({ x: 1200, y: 700 }), { x: 894, y: 530 })
  assert.deepEqual(clampToWalkArea({ x: 480, y: 420 }), { x: 480, y: 420 })
})

test('maps explicit daily contexts to room furniture anchors', () => {
  assert.equal(createContextIntent('focus').anchorId, 'desk')
  assert.equal(createContextIntent('meal').afterArrival, 'eating')
  assert.equal(createContextIntent('rest').anchorId, 'chair')
  assert.equal(createContextIntent('free').anchorId, 'home')
})

test('walks to an anchor and switches to its activity after arrival', () => {
  const machine = new RoomStateMachine({ x: 500, y: 500 })
  machine.requestContext('focus', 100)

  assert.equal(machine.snapshot().action, 'walk')
  for (let index = 0; index < 20; index += 1) machine.update(200)

  const state = machine.snapshot()
  assert.deepEqual(state.position, ROOM_ANCHORS.desk.position)
  assert.equal(state.action, 'studying')
  assert.equal(state.targetAnchorId, 'desk')
  assert.equal(state.facing, ROOM_ANCHORS.desk.facing)
})

test('conversation actions temporarily override lower priority ambient activity', () => {
  const machine = new RoomStateMachine()
  machine.request({ id: 'ambient', action: 'look-around', priority: 10, lockForMs: 5000 }, 100)
  machine.setConversationState('thinking', 200)

  assert.equal(machine.snapshot().action, 'thinking')
  assert.equal(machine.requestContext('meal', 300), false)
  assert.equal(machine.requestContext('meal', 30_000), false)
  assert.equal(machine.setConversationState('idle', 1000), true)
  assert.equal(machine.requestContext('meal', 1001), true)
})

test('builds no conversation intent for idle state', () => {
  assert.equal(createConversationIntent('idle'), undefined)
  assert.equal(createConversationIntent('speaking')?.action, 'speaking')
})
