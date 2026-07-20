import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateRoomWindowLayout } from '../src/main/window-layout'

const preferredSize = { width: 1180, height: 760 }
const requestedMinimumSize = { width: 920, height: 640 }

test('centers the preferred room size inside a large work area', () => {
  const layout = calculateRoomWindowLayout(
    { x: 0, y: 0, width: 1920, height: 1040 },
    preferredSize,
    requestedMinimumSize
  )

  assert.deepEqual(layout, {
    bounds: { x: 370, y: 140, width: 1180, height: 760 },
    minimumSize: { width: 920, height: 640 }
  })
})

test('fits the room to a 768p-class work area without crossing the taskbar', () => {
  const layout = calculateRoomWindowLayout(
    { x: 0, y: 0, width: 1366, height: 728 },
    preferredSize,
    requestedMinimumSize
  )

  assert.deepEqual(layout, {
    bounds: { x: 93, y: 0, width: 1180, height: 728 },
    minimumSize: { width: 920, height: 640 }
  })
})

test('clamps room bounds and minimum size to a smaller offset display', () => {
  const layout = calculateRoomWindowLayout(
    { x: -1024, y: 120, width: 800, height: 600 },
    preferredSize,
    requestedMinimumSize
  )

  assert.deepEqual(layout, {
    bounds: { x: -1024, y: 120, width: 800, height: 600 },
    minimumSize: { width: 800, height: 600 }
  })
})
