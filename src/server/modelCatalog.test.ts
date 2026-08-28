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
      codexModels: [
        {
          id: 'codex-model',
          displayName: 'Codex Model',
          supportedReasoningEfforts: [
            { reasoningEffort: 'high', description: 'High' },
            { reasoningEffort: 'max', description: 'Max' },
            { reasoningEffort: 'ultra', description: 'Ultra' },
          ],
          defaultReasoningEffort: 'ultra',
        },
      ],
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
        label: 'Codex Model',
        source: 'codex',
        isHidden: true,
        isSelectable: false,
        reasoningEfforts: ['high', 'max', 'ultra'],
        defaultReasoningEffort: 'ultra',
      },
    ])
  })

  it('allows order entries to match unique labels while keeping id priority', () => {
    const config = parseModelCatalogConfigText(JSON.stringify({
      order: ['GLM 5.2', 'claude-fable-5', 'Duplicated Label'],
      models: [
        {
          id: 'z-ai/glm-5.2(max)[1m]',
          label: 'GLM 5.2',
        },
        {
          id: 'claude-fable-5(max)[1m]',
          label: 'Claude Fable 5',
        },
        {
          id: 'claude-fable-5',
          label: 'Claude Fable 5 Alias',
        },
        {
          id: 'duplicate-a',
          label: 'Duplicated Label',
        },
        {
          id: 'duplicate-b',
          label: 'Duplicated Label',
        },
      ],
    }))

    expect(buildEffectiveModelCatalog({
      codexModels: [],
      providerModelIds: [],
      config,
    }).map((option) => option.id)).toEqual([
      'z-ai/glm-5.2(max)[1m]',
      'claude-fable-5',
      'claude-fable-5(max)[1m]',
      'duplicate-a',
      'duplicate-b',
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

  it('accepts max and ultra reasoning efforts in custom model config', () => {
    const config = parseModelCatalogConfigText(JSON.stringify({
      defaultModel: 'gpt-5.6',
      models: [
        {
          id: 'gpt-5.6',
          reasoningEfforts: ['high', 'max', 'ultra'],
          defaultReasoningEffort: 'max',
        },
      ],
    }))

    expect(config.defaultModel).toBe('gpt-5.6')

    expect(buildEffectiveModelCatalog({
      codexModels: [],
      providerModelIds: [],
      config,
    })[0]).toMatchObject({
      reasoningEfforts: ['high', 'max', 'ultra'],
      defaultReasoningEffort: 'max',
    })
  })

  it('keeps the top-level default effort separate and adds it to the default model options', () => {
    const config = parseModelCatalogConfigText(JSON.stringify({
      defaultModel: 'gpt-5.6',
      defaultReasoningEffort: 'max',
      models: [{
        id: 'gpt-5.6',
        reasoningEfforts: ['low', 'medium'],
        defaultReasoningEffort: 'low',
      }],
      order: [],
    }))

    expect(config.defaultReasoningEffort).toBe('max')
    expect(buildEffectiveModelCatalog({
      codexModels: [],
      providerModelIds: [],
      config,
    })[0]).toMatchObject({
      reasoningEfforts: ['max', 'low', 'medium'],
      defaultReasoningEffort: 'low',
    })
  })

  it('rejects an invalid top-level default effort', () => {
    expect(() => parseModelCatalogConfigText(JSON.stringify({
      defaultReasoningEffort: 'unsupported',
    }))).toThrow('defaultReasoningEffort must be one of')
  })

  it('preserves future upstream reasoning efforts while validating custom config values', () => {
    expect(buildEffectiveModelCatalog({
      codexModels: [
        {
          id: 'future-model',
          supportedReasoningEfforts: [{ reasoningEffort: 'future-tier' }],
          defaultReasoningEffort: 'future-tier',
        },
      ],
      providerModelIds: [],
      config: { models: [], order: [] },
    })[0]).toMatchObject({
      reasoningEfforts: ['future-tier'],
      defaultReasoningEffort: 'future-tier',
    })

    expect(() => parseModelCatalogConfigText(JSON.stringify({
      models: [{ id: 'future-model', reasoningEfforts: ['future-tier'] }],
    }))).toThrow('must be one of none, minimal, low, medium, high, xhigh, max, ultra')

    expect(() => parseModelCatalogConfigText(JSON.stringify({
      defaultModel: 42,
    }))).toThrow('defaultModel must be a string')
  })
})
