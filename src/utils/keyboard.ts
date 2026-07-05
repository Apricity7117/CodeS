export type KeyboardEventWithImeState = Pick<KeyboardEvent, 'isComposing' | 'keyCode'>
export type EnterKeyboardEvent = KeyboardEventWithImeState & Pick<KeyboardEvent, 'key'>

export function isImeComposingKeydown(event: KeyboardEventWithImeState): boolean {
  return event.isComposing || event.keyCode === 229
}

export function shouldHandleEnterKeydown(event: EnterKeyboardEvent): boolean {
  return event.key === 'Enter' && !isImeComposingKeydown(event)
}
