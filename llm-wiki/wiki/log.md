# Log

## [2026-06-09] ingest | completed turn Worked folding
- Added source: `raw/features/completed-turn-worked-folding.md`.
- Created wiki page: `concepts/completed-turn-worked-folding.md`.
- Documents: completed-turn `Worked for ...` folding, final assistant preservation, and the non-goal of restoring execution activity or web-search visualization.
- Updated `overview.md` and `index.md`.

## [2026-05-02] ingest | Directory Hub Composio and Skills search
- Added source: `raw/features/directory-hub-composio-skills-search.md`.
- Created wiki page: `concepts/directory-hub-composio-skills.md`.
- Documents: Skills tab default/query routing, MCP placement/reload behavior, `npx skills find/add` semantics, Composio CLI-backed connector behavior, search-ranking edge cases, and verification coverage.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-26] ingest | skills route UI and first-launch plugins card
- Added source: `raw/features/skills-route-ui-and-first-launch-card.md`.
- Created wiki page: `concepts/skills-route-ui.md`.
- Documents: Skills route rename, first-launch Plugins card persistence in global state, dark-theme regression/fix details, and `npm run dev` worktree reuse behavior.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-23] ingest | realtime chat rendering and inline media
- Added source: `raw/features/realtime-chat-rendering-inline-media.md`.
- Created wiki page: `concepts/realtime-chat-rendering.md`.
- Documents: chat render caching, realtime sync-churn reduction, large JSONL inline media findings, bridge-side media sanitization, and verification results.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-22] ingest | integrated terminal implementation
- Added source: `raw/features/integrated-terminal.md`.
- Created wiki page: `concepts/integrated-terminal.md`.
- Documents: Codex.app terminal parity facts, web endpoint design, PTY manager edge cases, visual review fixes, and verification coverage.
- Updated `overview.md`, `entities/codex-web-local.md`, and `index.md`.

## [2026-04-13] ingest | OpenCode Zen Big Pickle + Codex CLI fix
- Added source: `raw/fixes/opencode-zen-big-pickle-codex-cli.md`.
- Created wiki page: `concepts/opencode-zen-big-pickle.md`.
- Documents: Big Pickle only supports Chat Completions API; Codex CLI v0.93.0 needed for `wire_api = "chat"`; `opencode run` needs piped stdin in non-TTY.
- Updated `index.md`.

## [2026-04-10] ingest | codex-web-local project snapshot
- Added source: `raw/projects/codex-web-local.md`.
- Created wiki pages: `overview.md`, `entities/codex-web-local.md`, `concepts/merge-to-main-workflow.md`.
- Updated `index.md` with initial catalog entries.

## [2026-05-09] ingest | thread heartbeat automations
- Added source: `raw/features/thread-heartbeat-automations.md`.
- Created wiki page: `concepts/thread-heartbeat-automations.md`.
- Documents: multiple heartbeat automations per thread, ID-aware manager operations, and manual `Run now` behavior through the persisted thread queue.
- Updated `index.md`.

## [2026-05-09] ingest | OpenCode Zen reasoning_content proxy fix
- Added source: `raw/fixes/opencode-zen-reasoning-content-proxy.md`.
- Updated wiki page: `concepts/opencode-zen-big-pickle.md`.
- Documents: DeepSeek thinking-mode `reasoning_content` round-trip requirement, Chat-shaped Zen proxy endpoint selection, streaming reasoning preservation, Docker validation, and the `/tmp/app.tar` restart gotcha.
- Updated `index.md`.
## 2026-05-10

- Added project cron automation notes for sidebar project-level automation management.
- Updated project cron automation notes for the combined Automations panel.
- Updated Automations panel notes for active/newest sorting and direct edit buttons.
- Updated project cron automation notes for absolute cwd validation and multi-cwd preservation.

## [2026-05-19] ingest | Codex.app 外壳 token 对齐
- 新增来源：`raw/features/codex-app-shell-token-parity.md`。
- 新建 wiki 页面：`concepts/codex-app-shell-parity.md`。
- 记录内容：桌面 app CLI 边界、提取到的外壳 token、Vue token 映射、主 surface framing、默认侧栏宽度行为和截图产物。
- 更新 `index.md`。

## [2026-05-19] ingest | Codex.app composer 对齐
- 新增来源：`raw/features/codex-app-composer-parity.md`。
- 新建 wiki 页面：`concepts/codex-app-composer-parity.md`。
- 记录内容：桌面 app composer 参照、模型选择右下角位置、上下文用量显示、窄屏换行规则和截图产物。
- 更新 `index.md`。

## [2026-05-19] ingest | Codex.app 右侧常驻窗口对齐
- 新增来源：`raw/features/codex-app-inspector-panel-parity.md`。
- 新建 wiki 页面：`concepts/codex-app-inspector-panel-parity.md`。
- 更新 composer 对齐记录，将上下文用量从 pill 修订为圆形指示器与 hover 详情。
- 记录内容：Codex.app pinned summary 参照、右侧常驻窗口结构、Git 入口迁移、背景信息圆环、深色主题覆盖和截图产物。
- 更新 `index.md`。
