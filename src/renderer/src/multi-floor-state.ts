import type { ConversationState, Point, RoomAction, RoomContext } from './room-state'

export const BUILDING_WIDTH = 1200
export const BUILDING_HEIGHT = 900

export type FloorId = 'roof' | 'middle' | 'lower'
export type SpaceId =
  | 'observatory'
  | 'greenhouse'
  | 'archive'
  | 'laboratory'
  | 'study'
  | 'kitchen'
  | 'lounge'
  | 'bedroom'

export type BuildingSpace = {
  id: SpaceId
  floor: FloorId
  label: string
  subtitle: string
  bounds: { x: number; y: number; width: number; height: number }
  anchor: Point
  action: RoomAction
  facing: 'left' | 'right'
}

export const BUILDING_SPACES: Record<SpaceId, BuildingSpace> = {
  observatory: {
    id: 'observatory',
    floor: 'roof',
    label: '观测室',
    subtitle: '夜景与环境事件',
    bounds: { x: 70, y: 70, width: 500, height: 210 },
    anchor: { x: 330, y: 244 },
    action: 'look-around',
    facing: 'right'
  },
  greenhouse: {
    id: 'greenhouse',
    floor: 'roof',
    label: '温室',
    subtitle: '独处与照料植物',
    bounds: { x: 630, y: 70, width: 500, height: 210 },
    anchor: { x: 880, y: 244 },
    action: 'interaction',
    facing: 'left'
  },
  archive: {
    id: 'archive',
    floor: 'middle',
    label: '档案室',
    subtitle: '共同经历与长期记忆',
    bounds: { x: 70, y: 340, width: 310, height: 210 },
    anchor: { x: 220, y: 514 },
    action: 'studying',
    facing: 'right'
  },
  laboratory: {
    id: 'laboratory',
    floor: 'middle',
    label: '实验室',
    subtitle: '研究、学习与任务',
    bounds: { x: 430, y: 340, width: 390, height: 210 },
    anchor: { x: 620, y: 514 },
    action: 'studying',
    facing: 'right'
  },
  study: {
    id: 'study',
    floor: 'middle',
    label: '书房',
    subtitle: '阅读与安静对话',
    bounds: { x: 870, y: 340, width: 260, height: 210 },
    anchor: { x: 1000, y: 514 },
    action: 'sit',
    facing: 'left'
  },
  kitchen: {
    id: 'kitchen',
    floor: 'lower',
    label: '厨房',
    subtitle: '用餐与泡咖啡',
    bounds: { x: 70, y: 610, width: 330, height: 210 },
    anchor: { x: 235, y: 784 },
    action: 'eating',
    facing: 'right'
  },
  lounge: {
    id: 'lounge',
    floor: 'lower',
    label: '起居室',
    subtitle: '自由陪伴与日常对话',
    bounds: { x: 450, y: 610, width: 350, height: 210 },
    anchor: { x: 620, y: 784 },
    action: 'idle',
    facing: 'right'
  },
  bedroom: {
    id: 'bedroom',
    floor: 'lower',
    label: '卧室',
    subtitle: '休息与夜间状态',
    bounds: { x: 850, y: 610, width: 280, height: 210 },
    anchor: { x: 990, y: 784 },
    action: 'resting',
    facing: 'left'
  }
}

export const CONTEXT_SPACES: Record<RoomContext, SpaceId> = {
  free: 'lounge',
  focus: 'laboratory',
  meal: 'kitchen',
  rest: 'bedroom'
}

const FLOOR_LANDINGS: Record<FloorId, Point> = {
  roof: { x: 600, y: 244 },
  middle: { x: 600, y: 514 },
  lower: { x: 600, y: 784 }
}

const FLOOR_ORDER: FloorId[] = ['roof', 'middle', 'lower']

type RouteWaypoint = {
  position: Point
  mode: 'walking' | 'elevator'
}

function elevatorFloorsBetween(from: FloorId, to: FloorId): FloorId[] {
  const fromIndex = FLOOR_ORDER.indexOf(from)
  const toIndex = FLOOR_ORDER.indexOf(to)
  const direction = toIndex > fromIndex ? 1 : -1
  const floors: FloorId[] = []
  for (let index = fromIndex + direction; ; index += direction) {
    floors.push(FLOOR_ORDER[index])
    if (index === toIndex) return floors
  }
}

function nearestFloor(position: Point): FloorId {
  return FLOOR_ORDER.reduce((nearest, floor) =>
    Math.abs(FLOOR_LANDINGS[floor].y - position.y) <
    Math.abs(FLOOR_LANDINGS[nearest].y - position.y)
      ? floor
      : nearest
  )
}

export function planSpaceRoute(from: SpaceId, to: SpaceId): Point[] {
  if (from === to) return [{ ...BUILDING_SPACES[to].anchor }]
  const start = BUILDING_SPACES[from]
  const target = BUILDING_SPACES[to]
  if (start.floor === target.floor) return [{ ...target.anchor }]
  return [
    { ...FLOOR_LANDINGS[start.floor] },
    ...elevatorFloorsBetween(start.floor, target.floor).map((floor) => ({
      ...FLOOR_LANDINGS[floor]
    })),
    { ...target.anchor }
  ]
}

function planRouteFromPosition(position: Point, targetSpaceId: SpaceId): RouteWaypoint[] {
  const currentFloor = nearestFloor(position)
  const target = BUILDING_SPACES[targetSpaceId]
  if (currentFloor === target.floor) {
    return [{ position: { ...target.anchor }, mode: 'walking' }]
  }

  const currentLanding = FLOOR_LANDINGS[currentFloor]
  const isAtLanding =
    Math.abs(position.x - currentLanding.x) <= 1 && Math.abs(position.y - currentLanding.y) <= 1
  const route: RouteWaypoint[] = []
  if (!isAtLanding) route.push({ position: { ...currentLanding }, mode: 'walking' })
  for (const floor of elevatorFloorsBetween(currentFloor, target.floor)) {
    route.push({ position: { ...FLOOR_LANDINGS[floor] }, mode: 'elevator' })
  }
  route.push({ position: { ...target.anchor }, mode: 'walking' })
  return route
}

export type MultiFloorSnapshot = {
  position: Point
  spaceId: SpaceId
  targetSpaceId: SpaceId
  action: RoomAction
  facing: 'left' | 'right'
  moving: boolean
  travelMode: 'idle' | 'walking' | 'elevator'
}

const WALK_SPEED = 110
const ELEVATOR_NODE_DURATION_MS = 260

export class MultiFloorStateMachine {
  private position = { ...BUILDING_SPACES.lounge.anchor }
  private spaceId: SpaceId = 'lounge'
  private targetSpaceId: SpaceId = 'lounge'
  private route: RouteWaypoint[] = []
  private action: RoomAction = 'idle'
  private facing: 'left' | 'right' = 'right'
  private conversationState: ConversationState = 'idle'
  private elevatorElapsedMs = 0

  requestContext(context: RoomContext): void {
    this.requestSpace(CONTEXT_SPACES[context])
  }

  requestSpace(spaceId: SpaceId): void {
    this.targetSpaceId = spaceId
    this.route = planRouteFromPosition(this.position, spaceId)
    this.elevatorElapsedMs = 0
    this.action =
      this.conversationState !== 'idle'
        ? this.conversationState
        : this.route.length
          ? 'walk'
          : BUILDING_SPACES[spaceId].action
  }

  setConversationState(state: ConversationState): void {
    this.conversationState = state
    if (state !== 'idle') this.action = state
    else if (this.route.length) this.action = 'walk'
    else this.action = BUILDING_SPACES[this.spaceId].action
  }

  update(deltaMs: number): MultiFloorSnapshot {
    if (this.conversationState !== 'idle' || !this.route.length) return this.snapshot()
    const waypoint = this.route[0]
    const destination = waypoint.position
    if (waypoint.mode === 'elevator') {
      this.action = 'walk'
      this.elevatorElapsedMs += Math.max(0, deltaMs)
      if (this.elevatorElapsedMs < ELEVATOR_NODE_DURATION_MS) return this.snapshot()
      this.position = { ...destination }
      this.route.shift()
      this.elevatorElapsedMs = 0
      return this.finishRouteIfNeeded()
    }
    const dx = destination.x - this.position.x
    const dy = destination.y - this.position.y
    const distance = Math.hypot(dx, dy)
    const step = (WALK_SPEED * Math.max(0, deltaMs)) / 1000
    if (Math.abs(dx) > 1) this.facing = dx < 0 ? 'left' : 'right'
    if (distance <= Math.max(1, step)) {
      this.position = { ...destination }
      this.route.shift()
      return this.finishRouteIfNeeded()
    }
    this.position = {
      x: this.position.x + (dx / distance) * step,
      y: this.position.y + (dy / distance) * step
    }
    this.action = 'walk'
    return this.snapshot()
  }

  private finishRouteIfNeeded(): MultiFloorSnapshot {
    if (!this.route.length) {
      this.spaceId = this.targetSpaceId
      const space = BUILDING_SPACES[this.spaceId]
      this.action = space.action
      this.facing = space.facing
    }
    return this.snapshot()
  }

  snapshot(): MultiFloorSnapshot {
    const waypoint = this.route[0]
    const travelMode = waypoint?.mode ?? 'idle'
    return {
      position: { ...this.position },
      spaceId: this.spaceId,
      targetSpaceId: this.targetSpaceId,
      action: this.action,
      facing: this.facing,
      moving: this.route.length > 0,
      travelMode
    }
  }
}
