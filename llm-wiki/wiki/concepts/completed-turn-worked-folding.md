# Concept: Completed Turn Worked Folding

## Summary

Completed-turn rendering keeps the final assistant answer in the main conversation while folding intermediate process records behind a `Worked for ...` separator. This preserves the compact historical thread shape without reintroducing the newer execution-activity list or web-search visualization.

Sources:
- [Completed turn worked folding notes](../../raw/features/completed-turn-worked-folding.md)

## Rendering Model

`normalizeThreadMessagesV2` inserts a synthetic `worked` message for completed turns only when the turn has both:

- at least one intermediate process record
- a final assistant text result

`buildWorkedTurnGroups` then groups process records by `turnId`, falling back to `turnIndex`, and hides them from the main chat row loop. The `Worked for ...` row remains expandable so users can inspect intermediate assistant text, command rows, and file-change summaries.

## Boundary

This feature is separate from activity visualization. The UI should not restore execution-activity rows, live web-search rows, or command-action activity summaries as part of Worked folding.

## Verification Notes

Unit coverage should include:

- process messages hidden while the final assistant result remains visible
- no hiding when no final assistant result exists
- no cross-turn grouping
- non-text assistant outputs such as `imageView` remain visible

Manual checks should cover light and dark themes, expanding/collapsing `Worked for ...`, and confirming Sources stays empty when no real sources exist.
