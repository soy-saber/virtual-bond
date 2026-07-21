export type PetAction = 'idle' | 'interaction' | 'speaking' | 'dragging'

export type PetActionSignals = {
  isDragging: boolean
  isSpeaking: boolean
  isAwake: boolean
}

export function resolvePetAction(signals: PetActionSignals): PetAction {
  if (signals.isDragging) return 'dragging'
  if (signals.isSpeaking) return 'speaking'
  if (signals.isAwake) return 'interaction'
  return 'idle'
}
