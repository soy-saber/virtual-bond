export const ROOM_WIDTH = 960
export const ROOM_HEIGHT = 640

export type RoomContext = 'free' | 'focus' | 'meal' | 'rest'
export type ConversationState = 'idle' | 'thinking' | 'speaking'
export type RoomAction =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'look-around'
  | 'thinking'
  | 'speaking'
  | 'studying'
  | 'eating'
  | 'resting'
  | 'interaction'

export type RoomAnchorId = 'home' | 'desk' | 'table' | 'chair' | 'window'

export type Point = { x: number; y: number }

export type RoomAnchor = {
  id: RoomAnchorId
  label: string
  position: Point
  action: RoomAction
  facing: 'left' | 'right'
}

export type RoomIntent = {
  id: string
  action: RoomAction
  priority: number
  anchorId?: RoomAnchorId
  destination?: Point
  afterArrival?: RoomAction
  lockForMs?: number
  blocking?: boolean
}

export type RoomCharacterSnapshot = {
  position: Point
  facing: 'left' | 'right'
  action: RoomAction
  activeIntentId: string
  targetAnchorId?: RoomAnchorId
  progress: number
}

export const ROOM_ANCHORS: Record<RoomAnchorId, RoomAnchor> = {
  home: {
    id: 'home',
    label: '房间中央',
    position: { x: 508, y: 486 },
    action: 'idle',
    facing: 'right'
  },
  desk: {
    id: 'desk',
    label: '书桌',
    position: { x: 746, y: 388 },
    action: 'studying',
    facing: 'right'
  },
  table: {
    id: 'table',
    label: '餐桌',
    position: { x: 310, y: 460 },
    action: 'eating',
    facing: 'left'
  },
  chair: {
    id: 'chair',
    label: '阅读椅',
    position: { x: 170, y: 390 },
    action: 'resting',
    facing: 'right'
  },
  window: {
    id: 'window',
    label: '雨窗',
    position: { x: 544, y: 338 },
    action: 'look-around',
    facing: 'right'
  }
}

export const CONTEXT_ANCHORS: Record<RoomContext, RoomAnchorId> = {
  free: 'home',
  focus: 'desk',
  meal: 'table',
  rest: 'chair'
}

export const ACTION_LABELS: Record<RoomAction, string> = {
  idle: '在房间里陪着你',
  walk: '正在走过去',
  sit: '安静地坐着',
  'look-around': '在窗边看雨',
  thinking: '正在认真想你的问题',
  speaking: '正在和你说话',
  studying: '在书桌前查资料',
  eating: '正在好好吃饭',
  resting: '窝在椅子里休息',
  interaction: '正在回应你的互动'
}

const CONTEXT_ACTION_PRIORITY = 50
const CONVERSATION_PRIORITY = 80
const WALK_SPEED = 220

export function clampToWalkArea(point: Point): Point {
  const y = Math.min(530, Math.max(330, point.y))
  const depth = (y - 330) / 200
  const left = 122 - depth * 42
  const right = 838 + depth * 56
  return {
    x: Math.min(right, Math.max(left, point.x)),
    y
  }
}

export function createContextIntent(context: RoomContext): RoomIntent {
  const anchor = ROOM_ANCHORS[CONTEXT_ANCHORS[context]]
  return {
    id: `context:${context}`,
    action: 'walk',
    priority: CONTEXT_ACTION_PRIORITY,
    anchorId: anchor.id,
    destination: anchor.position,
    afterArrival: anchor.action
  }
}

export function createConversationIntent(state: ConversationState): RoomIntent | undefined {
  if (state === 'idle') return undefined
  return {
    id: `conversation:${state}`,
    action: state,
    priority: CONVERSATION_PRIORITY,
    lockForMs: state === 'thinking' ? 800 : 500,
    blocking: true
  }
}

export class RoomStateMachine {
  private position: Point
  private facing: 'left' | 'right'
  private action: RoomAction = 'idle'
  private activeIntent: RoomIntent = {
    id: 'initial',
    action: 'idle',
    priority: 0
  }
  private destination?: Point
  private origin?: Point
  private afterArrival: RoomAction = 'idle'
  private lockedUntil = 0

  constructor(position: Point = ROOM_ANCHORS.home.position) {
    this.position = { ...position }
    this.facing = 'right'
  }

  request(intent: RoomIntent, now = Date.now()): boolean {
    if (
      intent.priority < this.activeIntent.priority &&
      (this.activeIntent.blocking || now < this.lockedUntil)
    )
      return false

    this.activeIntent = { ...intent }
    this.lockedUntil = now + (intent.lockForMs ?? 0)
    if (intent.destination) {
      this.origin = { ...this.position }
      this.destination = clampToWalkArea(intent.destination)
      this.afterArrival = intent.afterArrival ?? 'idle'
      if (Math.abs(this.destination.x - this.position.x) > 1) {
        this.facing = this.destination.x < this.position.x ? 'left' : 'right'
      }
      this.action = 'walk'
    } else {
      this.destination = undefined
      this.origin = undefined
      this.action = intent.action
    }
    return true
  }

  requestContext(context: RoomContext, now = Date.now()): boolean {
    return this.request(createContextIntent(context), now)
  }

  requestMove(destination: Point, now = Date.now()): boolean {
    return this.request(
      {
        id: 'interaction:floor',
        action: 'walk',
        priority: 60,
        destination,
        afterArrival: 'idle'
      },
      now
    )
  }

  requestAnchor(anchorId: RoomAnchorId, now = Date.now()): boolean {
    const anchor = ROOM_ANCHORS[anchorId]
    return this.request(
      {
        id: `interaction:${anchorId}`,
        action: 'walk',
        priority: 65,
        anchorId,
        destination: anchor.position,
        afterArrival: anchor.action
      },
      now
    )
  }

  setConversationState(state: ConversationState, now = Date.now()): boolean {
    const intent = createConversationIntent(state)
    if (intent) return this.request(intent, now)
    if (!this.activeIntent.id.startsWith('conversation:')) return false
    this.activeIntent = { id: 'conversation:complete', action: 'idle', priority: 0 }
    this.action = 'idle'
    this.lockedUntil = now
    return true
  }

  update(deltaMs: number): RoomCharacterSnapshot {
    if (!this.destination || this.action !== 'walk') return this.snapshot()

    const dx = this.destination.x - this.position.x
    const dy = this.destination.y - this.position.y
    const distance = Math.hypot(dx, dy)
    const step = (WALK_SPEED * Math.max(0, deltaMs)) / 1000
    if (distance <= Math.max(1, step)) {
      this.position = { ...this.destination }
      this.destination = undefined
      this.origin = undefined
      this.action = this.afterArrival
      const anchor = this.activeIntent.anchorId
        ? ROOM_ANCHORS[this.activeIntent.anchorId]
        : undefined
      if (anchor) this.facing = anchor.facing
      return this.snapshot()
    }

    this.position = {
      x: this.position.x + (dx / distance) * step,
      y: this.position.y + (dy / distance) * step
    }
    return this.snapshot()
  }

  snapshot(): RoomCharacterSnapshot {
    let progress = 1
    if (this.destination && this.origin) {
      const total = Math.hypot(
        this.destination.x - this.origin.x,
        this.destination.y - this.origin.y
      )
      const remaining = Math.hypot(
        this.destination.x - this.position.x,
        this.destination.y - this.position.y
      )
      progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1
    }
    return {
      position: { ...this.position },
      facing: this.facing,
      action: this.action,
      activeIntentId: this.activeIntent.id,
      targetAnchorId: this.activeIntent.anchorId,
      progress
    }
  }
}
