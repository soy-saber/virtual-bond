export interface WindowSize {
  width: number
  height: number
}

export interface WindowRectangle extends WindowSize {
  x: number
  y: number
}

export interface RoomWindowLayout {
  bounds: WindowRectangle
  minimumSize: WindowSize
}

export function calculateRoomWindowLayout(
  workArea: WindowRectangle,
  preferredSize: WindowSize,
  requestedMinimumSize: WindowSize
): RoomWindowLayout {
  const width = Math.min(preferredSize.width, workArea.width)
  const height = Math.min(preferredSize.height, workArea.height)
  const bounds = {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height
  }

  return {
    bounds,
    minimumSize: {
      width: Math.min(requestedMinimumSize.width, bounds.width),
      height: Math.min(requestedMinimumSize.height, bounds.height)
    }
  }
}
