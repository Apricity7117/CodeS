import { describe, expect, it } from 'vitest'
import type { UiFileChange, UiMessage } from '../../types/codex'
import {
  aggregateFileChanges,
  buildDiffViewerLines,
  buildFileChangeCopyText,
  buildFileChangeDeltaParts,
  diffViewerMarker,
  displayFileChangePath,
  fileChangeOperationLabel,
  fileChangeOperationTone,
  fileChangeSummaryLabel,
  fileChangeSummaryStatusParts,
  formatFileChangeCountLabel,
  formatFileChangeDelta,
  hasDiffViewerContent,
  hasStructuredUnifiedDiff,
  inferDiffViewerLanguage,
  isFileChangeMessage,
  readActiveDiffViewerChange,
  readFileChangeMessageSummary,
} from './threadFileChanges'

function fileChange(options: Partial<UiFileChange> = {}): UiFileChange {
  return {
    path: 'src/App.vue',
    operation: 'update',
    movedToPath: null,
    diff: '',
    addedLineCount: 0,
    removedLineCount: 0,
    ...options,
  }
}

function message(options: Partial<UiMessage> = {}): UiMessage {
  return {
    id: 'file-change-1',
    role: 'assistant',
    text: '',
    messageType: 'fileChange',
    fileChangeStatus: 'completed',
    fileChanges: [fileChange()],
    ...options,
  }
}

describe('thread file change utilities', () => {
  it('detects completed file change messages and builds message summaries', () => {
    const completed = message()
    expect(isFileChangeMessage(completed)).toBe(true)
    expect(readFileChangeMessageSummary(completed)).toEqual({
      changes: completed.fileChanges,
      sourceMessageIds: ['file-change-1'],
      source: 'metadata',
    })

    expect(isFileChangeMessage(message({ fileChangeStatus: 'inProgress' }))).toBe(false)
    expect(readFileChangeMessageSummary(message({ fileChanges: [] }))).toBeNull()
  })

  it('merges repeated paths and sorts by operation priority then path', () => {
    const changes = aggregateFileChanges([
      fileChange({
        path: 'src/b.ts',
        operation: 'update',
        diff: 'first',
        addedLineCount: 2,
        removedLineCount: 1,
      }),
      fileChange({
        path: 'src/a.ts',
        operation: 'delete',
        diff: 'deleted',
        removedLineCount: 3,
      }),
      fileChange({
        path: 'src/b.ts',
        operation: 'add',
        diff: 'second',
        addedLineCount: 4,
      }),
      fileChange({
        path: 'src/c.ts',
        operation: 'update',
        diff: 'edited',
        addedLineCount: 1,
      }),
    ])

    expect(changes.map((change) => `${change.operation}:${change.path}`)).toEqual([
      'add:src/b.ts',
      'update:src/c.ts',
      'delete:src/a.ts',
    ])
    expect(changes[0]).toMatchObject({
      path: 'src/b.ts',
      operation: 'add',
      diff: 'first\nsecond',
      addedLineCount: 6,
      removedLineCount: 1,
    })
  })

  it('formats operation labels, deltas, summaries, and copied text', () => {
    const moved = fileChange({
      path: '/Users/a/project/src/old.ts',
      movedToPath: '/Users/a/project/src/new.ts',
      addedLineCount: 0,
      removedLineCount: 0,
    })
    const editedMove = fileChange({ movedToPath: 'src/new.ts', addedLineCount: 3 })
    const added = fileChange({ operation: 'add', addedLineCount: 5 })
    const deleted = fileChange({ operation: 'delete', removedLineCount: 2 })

    expect(fileChangeOperationLabel(moved)).toBe('Moved')
    expect(fileChangeOperationLabel(editedMove)).toBe('Moved + edited')
    expect(fileChangeOperationLabel(added)).toBe('Added')
    expect(fileChangeOperationLabel(deleted)).toBe('Deleted')
    expect(fileChangeOperationTone(moved)).toBe('move')
    expect(formatFileChangeDelta(fileChange({ addedLineCount: 3, removedLineCount: 1 }))).toBe('+3 -1')
    expect(buildFileChangeDeltaParts(0, 0, 'Ready')).toEqual([{ tone: 'neutral', label: 'Ready' }])

    const summary = { changes: [moved, added], sourceMessageIds: [], source: 'metadata' as const }
    expect(formatFileChangeCountLabel(2)).toBe('2 files changed')
    expect(formatFileChangeCountLabel(2, (key, params) => `${key}:${params?.count ?? ''}`)).toBe('{count} files changed:2')
    expect(fileChangeSummaryLabel(null)).toBe('Modified files')
    expect(fileChangeSummaryLabel(summary)).toBe('2 files changed')
    expect(fileChangeSummaryStatusParts({ ...summary, changes: [moved] })).toEqual([{ tone: 'neutral', label: 'Moved' }])
    expect(displayFileChangePath('/Users/a/project/src/App.vue', '/Users/a/project')).toBe('src/App.vue')
    expect(buildFileChangeCopyText(summary, '/Users/a/project')).toBe([
      'Modified files:',
      '- Moved: src/old.ts -> src/new.ts',
      '- Added: src/App.vue (+5)',
    ].join('\n'))
  })

  it('parses structured unified diffs with line numbers and markers', () => {
    const change = fileChange({
      path: 'src/example.ts',
      diff: [
        'diff --git a/src/example.ts b/src/example.ts',
        '--- a/src/example.ts',
        '+++ b/src/example.ts',
        '@@ -10,3 +10,4 @@',
        ' const old = 1',
        '-const removed = true',
        '+const added = true',
        ' const after = 2',
      ].join('\n'),
    })

    expect(hasStructuredUnifiedDiff(change)).toBe(true)
    const lines = buildDiffViewerLines(change)
    expect(lines.map((line) => line.kind)).toEqual([
      'meta',
      'meta',
      'meta',
      'hunk',
      'context',
      'remove',
      'add',
      'context',
    ])
    expect(lines.slice(4).map((line) => [line.oldLine, line.newLine, line.text])).toEqual([
      [10, 10, 'const old = 1'],
      [11, null, 'const removed = true'],
      [null, 11, 'const added = true'],
      [12, 12, 'const after = 2'],
    ])
    expect(diffViewerMarker(lines[3])).toBe('@@')
    expect(diffViewerMarker(lines[5])).toBe('-')
    expect(diffViewerMarker(lines[6])).toBe('+')
  })

  it('builds synthetic diff lines for non-unified content and selects active changes', () => {
    const added = fileChange({ path: 'src/new.ts', operation: 'add', diff: 'one\ntwo\n' })
    const deleted = fileChange({ path: 'src/old.ts', operation: 'delete', diff: 'gone' })
    const update = fileChange({ path: 'src/component.vue', movedToPath: 'src/component.ts' })

    expect(buildDiffViewerLines(added).map((line) => [line.kind, line.oldLine, line.newLine, line.text])).toEqual([
      ['add', null, 1, 'one'],
      ['add', null, 2, 'two'],
    ])
    expect(buildDiffViewerLines(deleted).map((line) => [line.kind, line.oldLine, line.newLine, line.text])).toEqual([
      ['remove', 1, null, 'gone'],
    ])
    expect(buildDiffViewerLines(null)).toEqual([])
    expect(hasDiffViewerContent(fileChange({ diff: 'content' }))).toBe(true)
    expect(hasDiffViewerContent(fileChange({ diff: '   ' }))).toBe(false)
    expect(inferDiffViewerLanguage(update)).toBe('typescript')
    expect(readActiveDiffViewerChange([added, deleted], 'missing')).toBe(added)
    expect(readActiveDiffViewerChange([added, deleted], 'src/old.ts\u0000')).toBe(deleted)
    expect(readActiveDiffViewerChange([], '')).toBeNull()
  })
})
