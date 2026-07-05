import { describe, expect, it } from 'vitest'
import {
  isImeComposingKeydown,
  shouldHandleEnterKeydown,
  type EnterKeyboardEvent,
} from './keyboard'

function keyboardEvent(overrides: Partial<EnterKeyboardEvent>): EnterKeyboardEvent {
  return {
    isComposing: false,
    key: 'Enter',
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

describe('shouldHandleEnterKeydown', () => {
  it('ignores Enter while IME composition is active', () => {
    expect(shouldHandleEnterKeydown(keyboardEvent({ isComposing: true }))).toBe(false)
  })

  it('ignores legacy IME composition Enter events', () => {
    expect(shouldHandleEnterKeydown(keyboardEvent({ keyCode: 229 }))).toBe(false)
  })

  it('ignores non-Enter keys', () => {
    expect(shouldHandleEnterKeydown(keyboardEvent({ key: 'a' }))).toBe(false)
  })

  it('handles Enter after composition is committed', () => {
    expect(shouldHandleEnterKeydown(keyboardEvent({ isComposing: false, keyCode: 13 }))).toBe(true)
  })
})
