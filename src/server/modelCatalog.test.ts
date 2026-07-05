import { describe, expect, it } from 'vitest'
import {
  buildEffectiveModelCatalog,
  parseModelCatalogConfigText,
} from './modelCatalog'

describe('model catalog', () => {
  it('merges discovered and configured models with order, labels, and hidden state', () => {
    const config = parseModelCatalogConfigText(JSON.stringify({
      order: ['custom-model', 'provider-model'],
      models: [
        {
          id: 'provider-model',
          label: 'Provider Model',
          reasoningEfforts: ['minimal', 'low'],
          defaultReasoningEffort: 'minimal',
        },
        {
          id: 'codex-model',
          hidden: true,
        },
        {
          id: 'custom-model',
          label: 'Custom Model',
        },
      ],
    }))

    expect(buildEffectiveModelCatalog({
      codexModelIds: ['codex-model'],
      providerModelIds: ['provider-model'],
      config,
    })).toEqual([
      {
        id: 'custom-model',
        label: 'Custom Model',
        source: 'custom',
        isHidden: false,
        isSelectable: true,
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
      },
      {
        id: 'provider-model',
        label: 'Provider Model',
        source: 'provider',
        isHidden: false,
        isSelectable: true,
        reasoningEfforts: ['minimal', 'low'],
        defaultReasoningEffort: 'minimal',
      },
      {
        id: 'codex-model',
        label: 'codex-model',
        source: 'codex',
        isHidden: true,
        isSelectable: false,
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
      },
    ])
  })

  it('rejects invalid model catalog config', () => {
    expect(() => parseModelCatalogConfigText('{')).toThrow('Invalid JSON')
    expect(() => parseModelCatalogConfigText(JSON.stringify({
      models: [
        {
          id: 'bad-model',
          reasoningEfforts: ['low'],
          defaultReasoningEffort: 'high',
        },
      ],
    }))).toThrow('defaultReasoningEffort must be included in reasoningEfforts')
  })
})
