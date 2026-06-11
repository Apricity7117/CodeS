# Completed Turn Worked Folding Notes

Captured: 2026-06-09

## Source Context

Relevant files:
- `src/api/normalizers/v2.ts`
- `src/components/content/threadWorkedGrouping.ts`
- `src/components/content/ThreadConversation.vue`
- `src/components/content/threadWorkedGrouping.test.ts`
- `src/api/normalizers/v2.test.ts`
- `tests.md`

## Behavior

- Historical completed turns insert a synthetic `worked` message immediately before the final assistant text result when the same turn has intermediate renderable process records.
- Process records folded under `Worked for ...` include:
  - assistant text before the final assistant result
  - completed command execution messages
  - completed file-change messages
- The final assistant text result remains a top-level chat row and is not moved into the folded details.
- Process assistant text hidden under `Worked for ...` is excluded from copy/fork response anchoring, so response actions target the final assistant result.
- Turns without a final assistant text result do not receive a synthetic `worked` separator.

## Non-Goals

- Do not restore red-box style execution activity lists.
- Do not render web-search records as chat activity or source rows.
- Do not restore command-action activity aggregation for completed turn visualization.

## Verification

- `pnpm run test:unit -- src/api/normalizers/v2.test.ts src/components/content/threadWorkedGrouping.test.ts src/composables/useDesktopState.test.ts src/components/content/inspectorProgress.test.ts`
- `pnpm run build:frontend`
- Manual light/dark checks are tracked in `tests.md` under `Regression: Worked 折叠保留，执行活动与联网搜索可视化取消`.
