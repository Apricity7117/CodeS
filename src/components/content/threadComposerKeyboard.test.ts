import { describe, expect, it } from 'vitest'
import { isImeComposingKeydown, type ComposerKeyboardEvent } from './threadComposerKeyboard'

function keyboardEvent(overrides: Partial<ComposerKeyboardEvent>): ComposerKeyboardEvent {
  return {
    isComposing: false,
    keyCode: 13,
    ...overrides,
  }
}

describe('isImeComposingKeydown', () => {
  it('detects active IME composition from KeyboardEvent.isComposing', () => {
    expect(isImeComposingKeydown(keyboardEvent({ isComposing: true }))).toBe(true)
  })

  it('detects legacy IME composition keyCode 229', () => {
    expect(isImeComposingKeydown(keyboardEvent({ keyCode: 229 }))).toBe(true)
  })

  it('allows normal Enter keydown after composition is committed', () => {
    expect(isImeComposingKeydown(keyboardEvent({ isComposing: false, keyCode: 13 }))).toBe(false)
  })
})
