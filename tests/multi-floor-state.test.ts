import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDING_SPACES,
  CONTEXT_SPACES,
  MultiFloorStateMachine,
  planSpaceRoute
} from '../src/renderer/src/multi-floor-state'

test('maps daily contexts to distinct building spaces', () => {
  assert.equal(CONTEXT_SPACES.free, 'lounge')
  assert.equal(CONTEXT_SPACES.focus, 'laboratory')
  assert.equal(CONTEXT_SPACES.meal, 'kitchen')
  assert.equal(CONTEXT_SPACES.rest, 'bedroom')
})

test('uses a direct route inside one floor and landings across floors', () => {
  assert.deepEqual(planSpaceRoute('kitchen', 'bedroom'), [BUILDING_SPACES.bedroom.anchor])
  const route = planSpaceRoute('bedroom', 'observatory')
  assert.equal(route.length, 4)
  assert.deepEqual(route.at(-1), BUILDING_SPACES.observatory.anchor)
  assert.equal(route[0].y, BUILDING_SPACES.bedroom.anchor.y)
  assert.equal(route[1].y, BUILDING_SPACES.laboratory.anchor.y)
  assert.equal(route[2].y, BUILDING_SPACES.observatory.anchor.y)
})

test('walks across floors and enters the target room activity', () => {
  const machine = new MultiFloorStateMachine()
  machine.requestSpace('observatory')
  for (let index = 0; index < 60; index += 1) machine.update(200)
  const snapshot = machine.snapshot()
  assert.equal(snapshot.spaceId, 'observatory')
  assert.deepEqual(snapshot.position, BUILDING_SPACES.observatory.anchor)
  assert.equal(snapshot.action, 'look-around')
  assert.equal(snapshot.moving, false)
})

test('conversation pauses travel and resumes it afterward', () => {
  const machine = new MultiFloorStateMachine()
  machine.requestContext('focus')
  machine.update(300)
  const before = machine.snapshot().position
  machine.setConversationState('thinking')
  machine.update(1000)
  assert.deepEqual(machine.snapshot().position, before)
  assert.equal(machine.snapshot().action, 'thinking')
  machine.setConversationState('idle')
  machine.update(300)
  assert.notDeepEqual(machine.snapshot().position, before)
  assert.equal(machine.snapshot().action, 'walk')
})

test('keeps the conversation action when a new room is selected during a reply', () => {
  const machine = new MultiFloorStateMachine()
  machine.setConversationState('thinking')
  machine.requestSpace('observatory')
  assert.equal(machine.snapshot().action, 'thinking')
  assert.equal(machine.snapshot().targetSpaceId, 'observatory')
  machine.setConversationState('speaking')
  machine.requestSpace('kitchen')
  assert.equal(machine.snapshot().action, 'speaking')
  assert.equal(machine.snapshot().targetSpaceId, 'kitchen')
  machine.setConversationState('idle')
  assert.equal(machine.snapshot().action, 'walk')
  assert.equal(machine.snapshot().travelMode, 'walking')
})

test('distinguishes corridor walking from vertical elevator travel', () => {
  const machine = new MultiFloorStateMachine()
  machine.requestSpace('observatory')
  assert.equal(machine.snapshot().travelMode, 'walking')
  for (let index = 0; index < 2; index += 1) machine.update(200)
  assert.equal(machine.snapshot().travelMode, 'elevator')
  machine.update(300)
  assert.equal(machine.snapshot().travelMode, 'elevator')
  machine.update(300)
  assert.equal(machine.snapshot().travelMode, 'walking')
})

test('travels directly between elevator nodes without stopping on intermediate floors', () => {
  const machine = new MultiFloorStateMachine()
  machine.requestSpace('observatory')
  machine.update(200)
  assert.equal(machine.snapshot().travelMode, 'elevator')
  machine.update(300)
  assert.equal(machine.snapshot().position.y, BUILDING_SPACES.laboratory.anchor.y)
  machine.update(300)
  const snapshot = machine.snapshot()
  assert.equal(snapshot.travelMode, 'walking')
  assert.equal(snapshot.position.y, BUILDING_SPACES.observatory.anchor.y)
  assert.equal(snapshot.targetSpaceId, 'observatory')
})

test('replans from the current elevator node without creating a diagonal segment', () => {
  const machine = new MultiFloorStateMachine()
  machine.requestSpace('observatory')
  machine.update(200)
  machine.update(300)
  assert.equal(machine.snapshot().position.y, BUILDING_SPACES.laboratory.anchor.y)
  machine.requestSpace('kitchen')
  assert.equal(machine.snapshot().travelMode, 'elevator')
  const before = machine.snapshot().position
  machine.update(100)
  assert.deepEqual(machine.snapshot().position, before)
  machine.update(200)
  assert.equal(machine.snapshot().position.x, 600)
  assert.equal(machine.snapshot().position.y, BUILDING_SPACES.kitchen.anchor.y)
  assert.equal(machine.snapshot().travelMode, 'walking')
})
