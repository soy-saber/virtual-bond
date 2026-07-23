export type PetAction = 'idle' | 'interaction' | 'speaking' | 'pickup' | 'held-idle' | 'release'

export type PetDragState = 'idle' | 'active' | 'release'

export type PetActionSignals = {
  dragState: PetDragState
  isSpeaking: boolean
  isAwake: boolean
}

export function resolvePetAction(signals: PetActionSignals): PetAction {
  if (signals.dragState === 'active') return 'pickup'
  if (signals.dragState === 'release') return 'release'
  if (signals.isSpeaking) return 'speaking'
  if (signals.isAwake) return 'interaction'
  return 'idle'
}
