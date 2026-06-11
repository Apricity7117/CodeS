export type ComposerKeyboardEvent = Pick<KeyboardEvent, 'isComposing' | 'keyCode'>

export function isImeComposingKeydown(event: ComposerKeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}
