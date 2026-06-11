# 通用 UI 回归

聊天消息、Markdown、计划卡片、交互控件和无法归入特定域的 UI 回归。

> 本文件由根目录 `tests.md` 拆分而来，保留原有手动验证步骤。

### Regression: Worked 折叠保留，执行活动与联网搜索可视化取消

#### 前置条件
- 从当前仓库启动应用。
- 至少一个 completed turn 包含中间 assistant 文本、命令执行或文件修改，并且有最终 assistant 回答。
- 至少一个线程包含命令执行历史或正在执行的本地命令。
- Settings 中可切换 light 和 dark theme。

#### 步骤
1. 在 light theme 打开包含 completed turn 的线程。
2. 确认 turn 的中间 assistant 文本、命令执行和文件修改不会作为独立主消息散落显示。
3. 确认最终 assistant 回答仍显示在 `Worked for ...` 分隔线之后。
4. 点击 `Worked for ...` 分隔线，确认展开区显示该 turn 的中间文本、命令和文件修改摘要。
5. 确认会话正文不显示逐条 `正在读取`、`正在搜索`、`正在回复` 活动列表。
6. 确认命令仍按旧样式显示为 `N commands · latest ... · Completed/Failed` 摘要卡片。
7. 确认右侧 Sources 保持 `No sources yet`/`暂无来源`。
8. 切换到 dark theme，重复步骤 1-7。

#### 预期结果
- Completed turn 的中间过程默认折叠到 `Worked for ...`，展开后可查看。
- 最终 assistant 回答仍在主会话流中保留，并且复制/派生线程行为锚定到最终回答。
- 红框式逐条活动列表不会出现。
- 绿框式命令摘要卡片仍保留展开、状态和输出查看能力。
- Progress 分区仍只在存在 plan steps 时出现在 Environment 和 Sources 之间。

#### 清理
- 恢复首选主题。

### Feature: Codex Desktop markdown code styling and text animation toggle

#### Prerequisites
- App is running from this repository.
- A thread contains an assistant response with inline code, a fenced code block, and an active or simulated live overlay.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the thread in light theme and inspect inline code, a fenced code block, the language label, and the code copy button.
2. Hover the code copy button, click it, and confirm the icon changes to the copied state without shifting the code block.
3. Open Settings and turn `Text shimmer animations` off.
4. Trigger or simulate a live `Thinking for Ns` or `Running command for Ns` label and confirm the text still updates but no shimmer sweep is rendered.
5. Turn `Text shimmer animations` back on and confirm the shimmer returns for active status text.
6. Switch to dark theme and repeat steps 1-5.

#### Expected Results
- Inline code renders as a neutral rounded chip aligned with Codex Desktop styling.
- Code blocks use the Codex Desktop neutral code surface, subtle border, language label, and local Codex copy/check SVG icons.
- The code copy hitbox remains stable and keyboard-focusable.
- The animation setting persists after reopening Settings or refreshing the page.
- Disabling text animations removes active shimmer layers from thinking/running labels while keeping status text readable and current.

#### Rollback/Cleanup
- Restore the preferred theme and `Text shimmer animations` setting.

### Feature: Codex Desktop plan card surface

#### Prerequisites
- App is running from this repository.
- A thread contains a completed plan, or a prompt can trigger a live plan.
- Light and dark themes are both available from Settings.

#### Steps
1. Open a thread with an inline plan in light theme.
2. Confirm the plan card uses a neutral foreground-tint surface with no blue border or blue background.
3. Confirm the plan header shows `Plan` or `Writing plan`, plus download, copy, and collapse controls aligned on the right.
4. Collapse and expand the plan, confirming the chevron direction, fade, and `Expand plan` control remain stable.
5. Click `Implement plan` on a completed assistant plan and confirm it still starts the existing implement flow.
6. Trigger a live plan and confirm the plan card remains in the message flow while the right inspector shows step progress separately.
7. Switch to dark theme and repeat steps 1-6.

#### Expected Results
- Plan cards match Codex Desktop's neutral `foreground/5` surface, clipped rounded corners, and borderless header/body structure.
- Markdown content, code, links, tables, and blockquotes stay readable in light and dark themes.
- Header actions stay visible, hoverable, keyboard-focusable, and do not shift layout.
- No sky/blue Plan-specific styling appears in either theme.

#### Rollback/Cleanup
- Restore the preferred theme.

### Feature: Codex Desktop thinking, inspector, dictation language, and settings switches

#### Prerequisites
- App is running from this repository.
- A reusable Codex.app CDP target or reference screenshot is available for visual comparison.
- Light and dark themes are both available from Settings.

#### Steps
1. Open an existing thread in light theme, open the top-right inspector, and confirm `Git` and `Sources` are visible.
2. Confirm the `Sources` section shows `No sources yet` when no real tool or web source exists, and no B/C/M debug rows are shown.
3. Open Settings, confirm the three settings switches use the Codex Desktop-style switch shape and can still toggle persisted values.
4. Open the dictation language dropdown from Settings, type in the search field, choose a language, reopen it, and close it by clicking outside.
5. Send a prompt and confirm the live assistant overlay starts with `Thinking`, then updates to `Thinking for Ns` after one second with shimmer animation.
6. Switch to dark theme and repeat steps 1-5.

#### Expected Results
- Inspector sources follow Codex Desktop semantics and show an empty state instead of CodeS debug source rows.
- Settings switches expose `role="switch"` and keep correct checked states in light and dark themes.
- The dictation language menu is fixed-position, is not clipped by the settings scroll panel, and does not show white control blocks in dark theme.
- The thinking label updates every second while the turn is active and stops when the turn completes.
- Light and dark screenshots remain visually aligned with Codex Desktop for the changed surfaces.

#### Rollback/Cleanup
- Restore any settings toggled during verification to the preferred local values.

## Template

### Feature: <name>

#### Prerequisites
- <required setup>

#### Steps
1. <action>
2. <action>

#### Expected Results
- <result>

#### Rollback/Cleanup
- <cleanup action, if any>

### Feature: Project automations and `/automations` panel

#### Prerequisites
- App is running from this repository.
- At least two sidebar projects have absolute workspace paths.
- Local Codex home is writable (`$CODEX_HOME` or `~/.codex`).
- Light and dark themes are both available from Settings.

#### Steps
1. In light theme, open a project overflow menu for a project without an attached automation.
2. Confirm the menu shows `Add automation…`, then create a project automation with a name, prompt, RRULE schedule, and status.
3. Confirm the project row shows an automation chip and the same menu changes to `Manage automations…`.
4. Open `/automations` from the sidebar and confirm the new project automation appears with the visible project display name.
5. Edit the automation from `/automations`, change its name and status, save, and confirm the project row chip count and tooltip update without a full page refresh.
6. Seed or keep a cron automation record whose `cwds` contains two project paths, then edit it from one project and confirm both project rows show the updated name/status.
7. Seed a cron automation record with a TOML-style single-quoted `cwds` array such as `cwds = ['/tmp/project-one', '/tmp/project,two']`, refresh `/automations`, and confirm it is still listed.
8. Inspect `/codex-api/project-automations` for the seeded record and confirm the response includes public automation fields but not `extraTomlLines`.
9. Remove one project that has an attached automation while `/automations` is open and confirm the panel removes the deleted project row after the cleanup completes.
10. Switch to dark theme and repeat opening the project menu and `/automations`; confirm rows, chips, buttons, inputs, and empty states remain readable.

#### Expected Results
- Project-scoped cron automations are listed under every associated `cwd`.
- Editing a multi-`cwd` project automation refreshes all affected sidebar chips/tooltips, not only the currently edited project.
- Existing TOML cron records with valid non-JSON string arrays remain visible and manageable.
- Automation API responses do not include internal preserved TOML metadata such as `extraTomlLines`.
- Removing a project deletes or detaches that project's automation association and refreshes the `/automations` panel.
- Preserved TOML metadata and table sections remain intact after saving or deleting a project automation.
- Light and dark theme project automation surfaces remain readable.

#### Rollback/Cleanup
- Remove any test project automations from the project automation dialog or delete their folders under `$CODEX_HOME/automations/<automation-id>/`.
- Remove temporary test projects or workspace roots created for verification.

### Feature: Projectless new chat folders

#### Prerequisites
- App server is running from this repository.
- Home directory is writable.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme and click the sidebar `New chat` action while an existing thread is selected.
2. Confirm the home composer does not inherit the selected thread folder.
3. Send a first message with a unique prompt such as `Projectless folder smoke test`.
4. Confirm the new thread starts in `~/Documents/Codex/<YYYY-MM-DD>/projectless-folder-smoke-test`.
5. Start another new chat with the same prompt and confirm the folder receives a numeric suffix.
6. Switch to dark theme and repeat steps 1-3 with a different unique prompt.

#### Expected Results
- `New chat` starts as a projectless chat instead of reusing the current thread cwd.
- Sending the first message creates a real directory under `~/Documents/Codex/<YYYY-MM-DD>/`.
- Folder names are derived from the prompt using lowercase alphanumeric tokens, with suffixes for duplicates.
- Projectless chat rows appear in the `Chats` section and do not create a separate project group from the generated folder name.
- Short projectless prompts such as `hi` remain visible in `Chats` after the thread list refreshes and workspace-root filtering runs.
- If the selected model returns `requires a newer version of Codex`, the turn retries with `gpt-5.4-mini` instead of leaving the new chat failed on 5.5.
- Light and dark theme composer surfaces remain readable and unchanged apart from the folder behavior.

#### Rollback/Cleanup
- Delete only the test folders created under `~/Documents/Codex/<YYYY-MM-DD>/`.

## New chat project setup modal

### Feature: Unified create project and GitHub clone modal

Prerequisites/setup:
- Run the app with access to `git` and network access to `github.com`.
- Have a small public GitHub repository URL available for testing.

Steps:
1. Open the app in light theme and navigate to the new chat screen.
2. Confirm the folder actions show `Select folder` and `Create Project`.
3. Click `Create Project` and confirm a modal opens with `New project` and `Clone from GitHub` modes.
4. In `New project`, keep or edit the destination folder, enter a single folder name, and submit.
5. Confirm the created project folder is selected in the new chat folder selector and appears as a project root.
6. Reopen the modal, switch to `Clone from GitHub`, paste a valid `https://github.com/<owner>/<repo>` URL, and submit.
7. Confirm the cloned repository folder is selected in the new chat folder selector and appears as a project root.
8. Switch the app to dark theme and repeat opening the modal.
9. Confirm the modal, tabs, inputs, error message, and buttons have readable contrast and stable spacing.

Expected results:
- New project creation and GitHub cloning share one modal and destination folder field.
- Created and cloned folders are registered as project roots and selected for the new chat.
- After cloning, the folder selector immediately includes the cloned project without a full page refresh.
- Invalid project names or non-GitHub URLs show an inline modal error without changing the selected folder.
- A stalled clone eventually fails with an error instead of keeping the request open indefinitely.
- Light and dark themes render the unified modal consistently with the existing new-chat controls.

Rollback/cleanup:
- Remove the created project folder from the filesystem if it was only used for testing.
- Remove the cloned repository folder from the filesystem if it was only used for testing.
- Remove the test projects from the app project list if they are no longer needed.

### Feature: Telegram chatIds persisted for bot DM sending

#### Prerequisites
- App server is running from this repository.
- Telegram bot already configured in the app.
- Access to `~/.codex/telegram-bridge.json`.

#### Steps
1. Send `/start` to the Telegram bot from your DM.
2. Wait for the app to process the update, then open `~/.codex/telegram-bridge.json`.
3. Confirm `chatIds` contains your DM chat id as the first element.
4. In the app, reconnect Telegram bot with the same token.
5. Re-open `~/.codex/telegram-bridge.json` and confirm `chatIds` remains present.

#### Expected Results
- `chatIds` is written after Telegram DM activity.
- `chatIds` persists across bot reconfiguration.
- `botToken`, `chatIds`, and `allowedUserIds` are all present in `~/.codex/telegram-bridge.json`.

#### Rollback/Cleanup
- Remove `chatIds` or delete `~/.codex/telegram-bridge.json` to clear persisted chat targets.

### Feature: Telegram bridge rejects unauthorized senders

#### Prerequisites
- App server is running from this repository.
- Telegram bot is configured with a known `allowedUserIds` entry.
- One Telegram account is allowlisted and one separate Telegram account is not.

#### Steps
1. From the allowlisted Telegram account, send `/start` to the bot.
2. Confirm the bot responds normally.
3. From the non-allowlisted Telegram account, send `/start` to the same bot.
4. From the non-allowlisted account, send a normal text prompt.

#### Expected Results
- The allowlisted account can use the Telegram bridge normally.
- The non-allowlisted account receives an unauthorized response.
- No thread is created or updated for the non-allowlisted account.

#### Rollback/Cleanup
- Remove test chat mappings from `~/.codex/telegram-bridge.json` if needed.

### 侧边栏底部与顶栏背景对齐

#### Feature/Change Name
侧边栏底部设置区、内容顶栏背景与 Codex 桌面端风格对齐，并隐藏左下角版本信息。

#### Prerequisites/Setup
1. 启动开发服务器或本地预览服务。
2. 准备一个已有会话，确保桌面宽度下侧边栏可见。
3. 外观设置可切换浅色和深色主题。

#### Steps
1. 在浅色主题打开会话页，观察内容顶栏背景应与主内容背景一致。
2. 在浅色主题观察左下角设置区，应与侧边栏背景一致，不再有额外底部色块。
3. 确认左下角设置按钮只显示“设置”与齿轮图标，不显示 `CodeS` 或 `v0.1.x` 版本信息。
4. 切换到深色主题，重复步骤 1-3。
5. 悬停左下角设置按钮，确认悬停态仍清晰可见，且不影响非悬停时的背景对齐。

#### Expected Results
- 浅色和深色主题下，内容顶栏不再出现独立异色背景。
- 浅色和深色主题下，侧边栏底部设置区与侧边栏主体背景融合。
- 左下角常驻设置按钮不再暴露 `CodeS` 名称和版本号。
- 设置按钮、图标和文字在浅色/深色主题下保持可读。

#### Rollback/Cleanup
- 无。

---

### Conversation code blocks and file summaries align

#### Feature/Change Name
Consistent assistant message width for code blocks and file-change summaries.

#### Prerequisites/Setup
1. Dev server running with threads that contain short code blocks and file-change summaries.
2. Test routes include `#/thread/019e21a9-aa9b-7de2-8dd7-59fe136ef618` and `#/thread/019e1f52-e06e-7e72-a3c0-27293881f2df`.
3. Light theme and dark theme both available from the appearance switcher.

#### Steps
1. In light theme, open the first test thread and find the short `zsh` code blocks near the file-change summary.
2. Confirm those code blocks use the same message-column width as other assistant code blocks instead of shrinking to the text width.
3. Confirm the nearby file-change summary uses the same width cap as code blocks and uses a solid Codex-style card, not a dashed command row.
4. Open the second test thread and compare file-change summary rows against nearby code blocks.
5. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- Assistant/system message bodies occupy the message column consistently.
- Code blocks and file-change summaries share the same `--chat-card-max` width cap.
- File-change summaries use token-driven light/dark surfaces, subtle solid borders, compact text, and muted row dividers.
- In Chinese UI, the sidebar route label reads `自动化`; in English UI, it remains `Automations`.
- File-change summaries do not repeat operation counts such as `edited`; they show the changed-file count plus the total `+/-` line deltas.

#### Rollback/Cleanup
- None.

---

### 聚合命令摘要与文件变更摘要样式一致

#### Feature/Change Name
连续命令聚合摘要行使用文件变更摘要的卡片视觉样式。

#### Prerequisites/Setup
1. 启动开发服务器或本地预览服务。
2. 准备一个包含连续命令执行记录的会话，例如 `#/thread/019e2a4d-12be-79c2-9d11-7f46d90c7583`。
3. 外观设置可切换浅色和深色主题。

#### Steps
1. 在浅色主题打开测试会话。
2. 找到聚合命令摘要，例如 `54 commands · latest: ...`。
3. 找到文件变更摘要，例如 `3 个文件已修改`。
4. 对比两者，确认文件变更摘要和聚合命令摘要使用同样的主列宽度、圆角卡片、实线边框、背景色、高度和普通 UI 字体节奏。
5. 找到单条命令摘要，例如 `/bin/bash -lc ...`，确认它的宽度、背景色、边框色、高度和圆角与聚合命令摘要一致。
6. 确认折叠状态的单条命令摘要下方没有额外黑线。
7. 展开聚合命令摘要，确认内部命令列表仍保持紧凑命令行样式。
8. 确认成功、失败和运行中状态文字仍按状态显示在摘要行右侧。
9. 切换到深色主题，重复步骤 2-8。

#### Expected Results
- 浅色和深色主题下，聚合命令摘要行与文件变更摘要行使用一致的主列宽度和视觉样式。
- 单条命令摘要行与聚合命令摘要行使用一致的宽度、背景色、边框色、高度和圆角。
- 折叠状态的命令输出区域不显示额外黑线。
- 聚合命令摘要的计数与 latest 文案使用普通 UI 字体，不再像命令行条目一样呈现。
- 失败、成功和运行中状态颜色仍然按状态显示在右侧。
- 展开后的多条命令列表仍可读，且不影响普通命令展开输出。

#### Rollback/Cleanup
- 无。

---

### 右侧常驻窗口 Plan 进度

#### Feature/Change Name
`turn/plan/updated` 进度显示在右侧常驻窗口的环境和来源之间，完成后自动折叠。

#### Prerequisites/Setup
1. 启动开发服务器或本地预览服务。
2. 准备一个可触发规划模式的会话。
3. 外观设置可切换浅色和深色主题。

#### Steps
1. 在浅色主题开启规划模式并发送一条会产生多步骤计划的消息。
2. 确认右侧常驻窗口打开时，分区顺序为环境、进度、来源；没有 plan 进度时只显示环境和来源。
3. 等待步骤状态变化，确认已完成步骤显示勾选状态，进行中步骤显示活动圆点，未开始步骤显示空圆。
4. 等待所有步骤完成，确认进度内容自动折叠，只保留进度标题行和右侧展开图标。
5. 点击进度标题右侧图标，确认完成后的进度内容可以手动展开和再次折叠。
6. 确认 Plan 卡片仍在消息流中显示，不再被右上角独立 Plan dock 隐藏。
7. 切换到深色主题，重复步骤 1-6。

#### Expected Results
- 进度只来自最新 plan 步骤，不使用线程进行中、待请求或终端状态合成假进度。
- 进度分区只在存在 plan 步骤时出现，且固定插入环境和来源之间。
- 每一步状态在浅色和深色主题下可读，完成后自动折叠但仍可手动展开。
- 消息流中的 Plan 卡片继续保留下载、复制、折叠和 `Implement plan` 行为。

#### Rollback/Cleanup
- 如果测试时修改了主题或常驻窗口偏好，删除对应 localStorage 偏好后刷新。

---

### 跳转到最新按钮尺寸调整

#### Feature/Change Name
会话底部“跳转到最新”浮动按钮调整为原尺寸约 74%。

#### Prerequisites/Setup
1. 启动开发服务器或本地预览服务。
2. 准备一个可滚动的长会话。
3. 外观设置可切换浅色和深色主题。

#### Steps
1. 在浅色主题打开长会话，并向上滚动到离底部较远的位置。
2. 确认底部中央出现“跳转到最新”浮动按钮。
3. 观察按钮直径约为原 44px 的 74%，即约 32px，图标同步缩放且仍居中。
4. 点击按钮，确认会话能滚动回最新输出。
5. 切换到深色主题，重复步骤 1-4。

#### Expected Results
- 浅色和深色主题下，浮动按钮尺寸比原始 44px 更克制，但仍易于点击。
- 按钮图标居中、方向正确，hover 状态不会造成明显布局跳动。
- 点击后仍能跳转到最新输出。

#### Rollback/Cleanup
- 无。

---

### Sidebar automations label and file-change summary copy

#### Feature/Change Name
Chinese automations label and non-redundant file-change summary text.

#### Prerequisites/Setup
1. Dev server running with a thread that contains file-change summaries.
2. UI language can be switched between English and Simplified Chinese.
3. Light theme and dark theme both available from the appearance switcher.

#### Steps
1. Switch UI language to Simplified Chinese.
2. Confirm the sidebar route label shows `自动化` next to the clock icon.
3. Open a thread with a file-change summary and confirm the summary text reads like `n 个文件已修改`, with total `+xx` and `-xx` shown on the right.
4. Confirm redundant text such as `n edited` is not shown in the summary row.
5. Switch UI language to English and confirm the sidebar route label remains `Automations`.
6. In English, confirm file-change summaries still read `1 file changed` or `n files changed`, with total `+/-` deltas on the right.
7. Repeat the summary checks in dark theme.

#### Expected Results
- Chinese UI translates the sidebar `Automations` label to `自动化`.
- English UI keeps `Automations` unchanged.
- File-change summary labels avoid duplicated operation counts while preserving total added and removed line counts.
- Light and dark summary rows remain readable.

#### Rollback/Cleanup
- None.

---

### Conversation inline code has flat Codex-style surfaces

#### Feature/Change Name
Inline code and code block inset border removal.

#### Prerequisites/Setup
1. Dev server running with a thread that contains inline code and fenced code blocks.
2. Light theme and dark theme both available from the appearance switcher.

#### Steps
1. In light theme, open the thread and inspect inline code such as `` `内容` ``.
2. Confirm inline code uses a flat `#f7f7f7` background with no visible inner outline.
3. Confirm fenced code blocks no longer show a separate inset outline around the block surface.
4. Switch to dark theme and repeat steps 1-3.

#### Expected Results
- Light inline code background is `#f7f7f7`; dark inline code background is `#282828`.
- Inline code and code blocks have flat surfaces without the previous one-pixel inset ring.
- Text remains readable in both light and dark themes.

#### Rollback/Cleanup
- None.

---

### Composer expands long drafts to full screen

#### Feature/Change Name
Thread composer full-screen expand control for multi-line drafts.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. Any existing thread is open and send controls are enabled
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, type or paste at least six lines into the composer.
2. Confirm the expand button appears in the composer input area.
3. Click the expand button.
4. Confirm the composer fills the viewport, keeps the draft text, and leaves model/skill/thinking/send controls usable at the bottom.
5. Click the collapse button.
6. Confirm the composer returns to its normal inline size with the draft still intact.
7. Switch to dark theme and repeat steps 1-6.

#### Expected Results
- Short drafts do not show the expand control.
- Long or overflowing drafts show an icon-only expand control.
- Full-screen mode uses the same draft state and submit controls as inline mode.
- Full-screen and inline states are readable in light theme and dark theme.

#### Rollback/Cleanup
- Clear the draft from the composer.

---

### Feedback actions removed

#### Feature/Change Name
Settings, reconnecting/live errors, and visible error banners no longer expose `Send feedback` or mailto diagnostics.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173` or an alternate free port).
2. Browser devtools available to inject a test error or failed fetch.
3. Light theme and dark theme both available from the appearance switcher.

#### Steps
1. In light theme, load the home screen, open Settings, and confirm no `Send feedback` row is visible.
2. Trigger a failure, for example run `fetch('/codex-api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })` in the browser console or open a folder path that produces a visible load error.
3. Reopen Settings and confirm no `Send feedback` row or `Issue detected` row appears after the failed request.
4. Trigger or view a visible error banner, such as the missing Codex CLI composer banner, a chat send/connection error in the live conversation overlay, a settings provider error, a folder picker error, a Skills Hub error, or a branch dropdown error, and confirm the error state contains only the error text and normal retry/action controls.
5. Confirm reconnecting/live error UI does not show `Send feedback` to the right of the status text.
6. Switch to dark theme and repeat steps 1-5.

#### Expected Results
- No runtime path records diagnostics for a Settings feedback row.
- No visible error state shows a `Send feedback` link or opens a `mailto:` draft.
- Error text remains readable in light and dark themes.

#### Rollback/Cleanup
- Restore any temporary API failure/proxy change.

---

### Qodo review fixes for PR 130 and PR 131 reverts

#### Feature/Change Name
Fix review regressions from reverting PR #130 and PR #131.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar has multiple projects, including duplicate folder leaf names when available
3. Sidebar has at least one projectless chat
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, search the sidebar so the project list is filtered.
2. Try to drag a project row while search is active.
3. Confirm no project drag or reorder starts during the filtered search view.
4. Clear search and drag a project row, then release it and confirm the follow-up click does not collapse or expand the dragged project unexpectedly.
5. Open a project menu near the bottom of the scrollable sidebar and confirm the menu opens upward only when needed and stays within the visible sidebar boundary.
6. Open or create a project whose folder leaf name collides with another root and confirm the intended full-path-disambiguated project moves to the top.
7. Confirm projectless chats with empty cwd remain visible when workspace roots are configured.
8. Switch to dark theme and repeat steps 1-7.

#### Expected Results
- Project dragging is disabled during sidebar search.
- Drag completion does not trigger an accidental project collapse or expansion.
- Project menu direction uses the rendered menu height and avoids viewport/sidebar overflow.
- Duplicate folder leaf names use the disambiguated project order name.
- Empty-cwd projectless chats remain visible.
- Sidebar rows, menus, and drag states remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---

### Composer mode scoping and Fast mode support

#### Feature/Change Name
Plan mode is scoped to the current chat instead of becoming the default for every chat, and Fast mode is available for supported GPT 5.4 and GPT 5.5 model IDs.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least two existing threads are available
3. Model list includes `gpt-5.4` or a `gpt-5.4-*` variant and `gpt-5.5` or a `gpt-5.5-*` variant
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open thread A, open the composer add menu, and enable Plan mode.
2. Open thread B and confirm Plan mode is off by default.
3. Return to thread A and confirm Plan mode remains on for that thread.
4. Open Start new thread, enable Plan mode, send a first message, and confirm the created thread starts in Plan mode.
5. Return to Start new thread again and confirm Plan mode is off for the next new chat.
6. Select `gpt-5.4` or a `gpt-5.4-*` model and confirm the Fast mode switch is visible.
7. Select `gpt-5.5` or a `gpt-5.5-*` model and confirm the Fast mode switch is visible.
8. Select an unsupported model family and confirm the Fast mode switch is hidden.
9. Switch to dark theme and repeat steps 1-8.

#### Expected Results
- Enabling Plan mode in one existing thread does not enable it in other existing threads.
- A new-chat Plan mode selection applies to the created chat but does not persist as the default for later new chats.
- Fast mode is visible for GPT 5.4 and GPT 5.5 model IDs, including dashed variants.
- Fast mode remains hidden for unsupported model families.
- Composer controls and menus remain readable in light and dark themes.

#### Rollback/Cleanup
- Turn Plan mode off in any test threads if desired.

---

### Feature: Markdown file links with backticked filename labels render correctly

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- Light and dark themes are both available.
- Local file exists at `/home/ubuntu/andClaw-srcmatch/app/src/main/java/com/coderred/andclaw/ui/util/TrustedBrowserLauncher.kt`.

#### Steps
1. In light theme, send a message containing: `Added [`TrustedBrowserLauncher.kt`](/home/ubuntu/andClaw-srcmatch/app/src/main/java/com/coderred/andclaw/ui/util/TrustedBrowserLauncher.kt)`.
2. Confirm the rendered message shows one clickable file link with visible text `TrustedBrowserLauncher.kt`.
3. Click the link and confirm it opens local browse for `/home/ubuntu/andClaw-srcmatch/app/src/main/java/com/coderred/andclaw/ui/util/TrustedBrowserLauncher.kt`.
4. Right-click the same link and choose `Copy link`, then paste it into a text field and inspect it.
5. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- The markdown link renders as one clickable file link instead of splitting around backticks.
- The visible link text is the markdown label `TrustedBrowserLauncher.kt`, without backtick glyphs.
- Clicking opens the local browse route for the full file path.
- Copied link includes the full encoded path and still resolves to the same file.
- Light and dark theme message surfaces keep the link readable and styled consistently.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Backticked HTTP(S) URL renders as clickable link

#### Prerequisites
- App is running from this repository.
- An active thread is open.

#### Steps
1. Send a message containing exactly: `` `https://github.com/marmeladema` ``.
2. Find the rendered message row and inspect the backticked URL token.
3. Click the rendered URL.

#### Expected Results
- The backticked URL is rendered as a clickable link, not plain inline code text.
- Clicking opens `https://github.com/marmeladema` in a new tab.

#### Rollback/Cleanup
- None.

### Feature: Revert new-project folder-browser flow to inline add flow

#### Prerequisites
- App is running from this repository.
- Home/new-thread screen is open.
- At least one writable parent directory exists for creating a test project folder.

#### Steps
1. On the home/new-thread screen, open the `Choose folder` dropdown.
2. Click `+ Add new project`.
3. Enter a new folder name (for example `New Project Inline Test`) and click `Open`.
4. Confirm the app selects the newly created/opened project folder.
5. Repeat step 2, but enter an absolute path to an existing folder and click `Open`.

#### Expected Results
- Clicking `+ Add new project` opens inline input inside the dropdown instead of navigating to `/codex-local-browse...`.
- Entering a folder name creates/selects that project under the current base directory.
- Entering an absolute path opens that existing folder without creating a nested directory.

#### Rollback/Cleanup
- Delete the test folder created in step 3 if it was created only for verification.

### Feature: Keep manual chat scroll position during streaming

#### Prerequisites
- App is running from this repository.
- A thread exists with enough history to allow scrolling away from bottom.

#### Steps
1. Open the thread and scroll upward so latest messages are not visible.
2. Send a new message that produces a streaming assistant response.
3. During streaming, do not scroll and observe viewport position.
4. After streaming completes, verify the viewport remains at the same manual position.

#### Expected Results
- Streaming updates do not force auto-scroll to the bottom when user has manually scrolled away.
- User can continue reading older history while the response streams.
- If the thread is already at the bottom when streaming starts, the latest streaming overlay remains visible.

#### Rollback/Cleanup
- Revert the scroll-preservation change in `src/components/content/ThreadConversation.vue` if manual scroll locking needs to be removed.

### Feature: Changed-files lookup fallback when turnId metadata is missing

#### Prerequisites
- App server running from this repository.
- Playwright CLI available.

#### Steps
1. Create/prepare a test workspace (example: `/tmp/rollback-pw`).
2. Call `/codex-api/worktree/auto-commit` with:
   - `cwd=/tmp/rollback-pw`
   - `message='pw-msg-turn-1'`
   - `turnId='turn-real-1'`
3. Call `/codex-api/worktree/message-changes` with:
   - same `cwd`
   - same `message`
   - mismatched `turnId='turn-wrong'`
4. Verify response is still `200` and returns the matching commit data (message-hash fallback).
5. Capture Playwright artifact screenshot.

#### Expected Results
- `message-changes` first attempts turnId lookup.
- If turnId lookup misses, it falls back to exact message-hash lookup.
- API returns commit data instead of `No matching commit found for this user message` when message matches.

#### Rollback/Cleanup
- Remove temporary test workspace if created.

### Feature: Changed-files panel persists across refresh (assistant message level)

#### Prerequisites
- App server running from this repository.
- Existing thread in `TestChat` project with completed assistant messages.
- Worktree rollback auto-commit enabled.

#### Steps
1. Open a `TestChat` thread and confirm assistant message cards render.
2. Verify changed-files panel is shown at the end of assistant messages that have rollback commit data.
3. Hard refresh the page.
4. Re-open the same `TestChat` thread.
5. Verify changed-files panel is still shown for the same assistant message(s).
6. Expand one file diff and verify diff content loads.

#### Expected Results
- Changed-files panel is attached to assistant messages (not transient worked separators).
- Changed-files panel appears only once per turn (on the last assistant message in that turn).
- Changed-files panel is hidden while a turn is still in progress.
- Panels remain available after refresh/restart because lookup is turnId/message-hash based.
- File diff expansion still lazy-loads and displays content.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Chat file-link context menu (open/copy/edit)

#### Prerequisites
- App server is running from this repository.
- Open a thread that contains rendered `.message-file-link` anchors (for example Markdown file links).

#### Steps
1. In a message with a file link, right-click the file link text.
2. Verify the custom context menu appears near the pointer.
3. Click `Open link` and confirm the link opens in a new tab.
4. Right-click the same file link again and click `Copy link`, then paste into a text input to verify copied value.
5. For links under `/codex-local-browse...`, right-click and click `Edit file`.
6. Click outside the menu and press `Escape` while the menu is open.

#### Expected Results
- Right-clicking any `.message-file-link` opens the custom context menu.
- Menu includes `Open link` and `Copy link` for all links.
- Menu includes `Edit file` only for browseable local file links.
- Pointer-down outside, blur, and `Escape` close the menu.

#### Rollback/Cleanup
- Close any tabs opened during the test.

### Feature: Show user file attachments as visible chips in chat

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open any thread with an active composer.
- Have at least one local file available to attach.

#### Steps
1. Attach one or more files via composer (file picker, paste long text as `.txt`, or other file attachment flow).
2. Send the message.
3. Locate the sent user message in conversation.
4. Verify file attachment chips are rendered above message text.
5. Click a file chip and confirm it opens the browse URL in a new tab/window.
6. Right-click the chip link and verify file-link context actions still appear (`Open link`, `Copy link`, and `Edit file` when applicable).

#### Expected Results
- Sent user messages with `fileAttachments` show visible file chips in chat.
- Chip labels match attachment labels from composer payload.
- Chip links resolve through browse URLs and remain clickable.
- Existing file-link context menu behavior works on the chip links.

#### Rollback/Cleanup
- Close any opened file tabs and remove temporary test messages if needed.

### Feature: Frontend missing-entry 404 page auto-redirects to chat

#### Prerequisites
- Build or runtime state where frontend entry cannot be served (for example missing `dist/index.html`).
- Start server and open the failing route in a browser.

#### Steps
1. Trigger the frontend missing-entry error page.
2. Confirm the page shows an error headline and a `Back to chat` link.
3. Wait 3 seconds without clicking the link.
4. Repeat and click `Back to chat` immediately.

#### Expected Results
- Error page still renders with the manual `Back to chat` link.
- Page automatically redirects to `/` after about 3 seconds.
- Manual link works instantly and is not blocked by the timer.

#### Rollback/Cleanup
- Restore frontend assets (`pnpm run build:frontend`) if they were intentionally removed for testing.

### Feature: Assistant streaming does not force-scroll when user is reading history

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Open a thread long enough to scroll.

#### Steps
1. Scroll up so latest message is not visible.
2. Send a new prompt and wait for assistant reply to stream.
3. Observe viewport while reply is in progress.
4. Click `Jump to latest` (or manually scroll to bottom).
5. Send another prompt and observe streaming behavior again.

#### Expected Results
- While scrolled up, streaming assistant output does not pull viewport to bottom.
- After returning to bottom, streaming output auto-follows newest content.

#### Rollback/Cleanup
- No cleanup required.

### Feature: Markdown file links with spaces and parentheses in path

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- File exists at `/home/ubuntu/Documents/New Project (2)/hosting_manager.py`.

#### Steps
1. Send this exact message:
   `[hosting_manager.py](/home/ubuntu/Documents/New Project (2)/hosting_manager.py)`
2. In the rendered message, confirm it appears as one clickable file link.
3. Click the link and confirm it opens local browse for the full file path.
4. Right-click and use `Copy link`, then verify pasted URL still points to the same full path.

#### Expected Results
- Markdown link is parsed as one link token (not split at `)` inside the path).
- Clicking navigates to the full file path in local browse view.
- Copied link contains the complete encoded path.

#### Rollback/Cleanup
- Remove test file if it was created only for this verification.

### Feature: Markdown link with backticked label renders as file link

#### Prerequisites
- App is running from this repository.
- An active thread is open.
- File exists at `/Users/igor/temp/TestChat/qwe.txt`.

#### Steps
1. Send this exact message:
   [`/Users/igor/temp/TestChat/qwe.txt`](/Users/igor/temp/TestChat/qwe.txt)
2. In the rendered message, confirm it appears as one clickable file link.
3. Verify the visible link text is `/Users/igor/temp/TestChat/qwe.txt` (without backticks).
4. Click the link and confirm it opens local browse for the full file path.

#### Expected Results
- Backticks inside markdown label do not break markdown-link parsing.
- The label renders as plain link text (no backtick glyphs).
- Clicking opens `/codex-local-browse/Users/igor/temp/TestChat/qwe.txt`.

#### Rollback/Cleanup
- Remove test file if it was created only for this verification.

### Feature: Backticked bare filenames render as file links

#### Prerequisites
- App is running from this repository.
- An active thread is open with a project `cwd`.
- Optional: file exists at `<project cwd>/redroid_mainactivity.png`.
- Verify once in light theme and once in dark theme.

#### Steps
1. Send this exact message:
   `redroid_mainactivity.png`
2. In the rendered message, confirm it appears as one clickable file link.
3. Click the link and confirm it opens local browse for `<project cwd>/redroid_mainactivity.png`.
4. Switch between light and dark theme and confirm the file-link chip remains readable.

#### Expected Results
- The backticked bare filename renders as `a.message-file-link`, not inline code.
- The link href resolves through `/codex-local-browse` using the current project `cwd`.
- The title contains the resolved file path, and the visible text is `redroid_mainactivity.png`.
- Light and dark themes both show the link with readable contrast.

#### Rollback/Cleanup
- Remove `<project cwd>/redroid_mainactivity.png` if it was created only for this verification.

---

### Feature: Lazy message rendering (windowed conversation)

#### Prerequisites
- App is running from this repository.
- A thread exists with more than 50 messages (send many short messages, or use a long-running session).

#### Steps — initial load window

1. Open a thread with 60+ messages.
2. Observe that the conversation list does **not** show all messages immediately — only the most recent ~50 are rendered.
3. Verify the latest messages are visible and the chat is scrolled to the bottom.
4. Confirm a "Load earlier messages" button appears at the top of the visible list.

#### Steps — scroll-triggered load

5. Scroll up slowly toward the top of the conversation list.
6. When the scroll position reaches within ~200 px of the top, verify that the previous 30 messages appear automatically above the current ones.
7. Confirm the viewport does **not** jump — the messages you were reading stay in view.
8. Repeat scrolling up to verify additional chunks load on demand.
9. Once all messages are loaded, verify the "Load earlier messages" button disappears.

#### Steps — manual load button

10. Reload the page and open the same long thread.
11. Click "Load earlier messages" button without scrolling.
12. Verify 30 older messages are prepended and scroll position is preserved.

#### Steps — live session growth

13. Start an active Codex session (or send many messages in quick succession).
14. Let the conversation exceed 50 messages while staying scrolled to the bottom.
15. Verify the rendered count stays bounded (top of the DOM list advances as new messages arrive).
16. Scroll up and confirm "Load earlier messages" works to reveal trimmed messages.

#### Steps — rollback / message shrink

17. In a thread with a turn that can be rolled back, trigger a rollback.
18. Verify the conversation does **not** go blank — messages still render after the list shrinks.
19. Confirm `renderWindowStart` recovers gracefully and earlier messages remain accessible.

#### Expected Results
- Only ≤50 messages are in the DOM on initial load.
- Scrolling to the top (or clicking the button) appends older messages without a viewport jump.
- During live output, the rendered window stays bounded; old messages are trimmed from the top while the user follows the bottom.
- After a rollback the conversation remains visible; no blank screen.

#### Rollback/Cleanup
- No persistent state is changed — closing or refreshing the tab resets the render window.

### API perf log bodyMB uses one decimal place

#### Feature/Change Name
`[codex-api-perf]` log entries format `bodyMB` with one decimal place instead of four.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A request large enough to trigger `[codex-api-perf]` logging

#### Steps
1. Trigger a `/codex-api/` request that exceeds the perf logging threshold
2. Inspect the server log line that includes `bodyMB=...`

#### Expected Results
- `bodyMB` is formatted with one decimal place, such as `bodyMB=3.4`
- The log does not print extra precision such as `bodyMB=3.4489`

#### Rollback/Cleanup
- None

---

### Assistant generated image rendering

#### Feature/Change Name
Codex app-server generated image items render as assistant image previews.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A Codex thread that has completed an image generation turn, or a test app-server payload containing either `type: "imageGeneration"` with a base64 `result` or `type: "imageView"` with an absolute image `path`

#### Steps
1. Open the thread in CodeS
2. Locate the completed image generation turn
3. Inspect the assistant response area where the generated image should appear
4. Click the generated image preview

#### Expected Results
- The generated image item appears as an assistant image preview instead of disappearing from the conversation
- The preview is rendered larger than normal user attachment thumbnails and keeps its aspect ratio
- Clicking the preview opens the existing image modal
- The image is served through `/codex-local-image?path=...`

#### Rollback/Cleanup
- Delete any temporary generated image files if they were created only for this test

---

### Completed plan cards expose implement action

#### Feature/Change Name
Completed plan cards show an `Implement plan` button that turns plan mode off and sends an implementation prompt built from the plan content.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. An existing thread contains a completed persisted plan card
3. The thread composer is available for follow-up messages

#### Steps
1. Open a thread containing a completed plan card
2. Verify the plan card shows `Implement plan` at the bottom
3. Click `Implement plan`
4. Confirm the composer thread switches back to default mode
5. Inspect the next `turn/start` request or the resulting assistant behavior

#### Expected Results
- Completed plan cards render the `Implement plan` action even when the plan body is structured as headings/lists instead of checkbox steps
- Clicking the button sends a simple implementation follow-up message instead of copying the whole plan body into chat
- The next turn runs in default mode rather than plan mode

#### Rollback/Cleanup
- Archive or delete any test thread created only for this check

---

### Terminal focus does not fullscreen panel

#### Feature/Change Name
Terminal focus on mobile keeps the terminal as a bottom panel instead of expanding it to full screen.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A thread or new-chat project with the terminal toggle available
3. Mobile viewport or mobile browser

#### Steps
1. Open a thread or new chat with a valid project path
2. Tap the terminal toggle
3. Tap inside the terminal area
4. If the virtual keyboard appears, keep focus in the terminal
5. Hide and reopen the terminal

#### Expected Results
- Terminal remains a bottom panel and does not take over the full viewport
- Conversation/new-chat content is not forcibly hidden by terminal focus
- Composer keeps its normal compact placement instead of stretching above the terminal
- Terminal can still fit within the available viewport when the keyboard changes size

#### Rollback/Cleanup
- Close the terminal panel

---

### Editable current folder path in the folder picker

#### Feature/Change Name
The `Select folder` dialog now lets the user edit the current folder path directly, reload that folder on `Enter` or blur, and open the typed path without first clicking a child row.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open the home/new-thread route
3. Have at least two accessible local directories available for navigation
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the `Select folder` dialog from the new-thread folder chooser
2. Confirm the `Current folder` field is an editable text input instead of static text
3. Type a different absolute path and press `Enter`
4. Confirm the folder list reloads for the typed path
5. Edit the path again, click outside the input, and confirm blur also reloads the listing
6. Type a valid absolute path and click `Open`
7. Reopen the dialog, switch to dark theme, and confirm the editable current-folder input remains readable and focusable

#### Expected Results
- The current-folder path can be typed into directly
- Pressing `Enter` on a changed path reloads the folder listing for that path
- Blurring a changed path also reloads the folder listing for that path
- Clicking `Open` uses the typed path when it is valid
- The input remains readable and has visible focus treatment in both light theme and dark theme

#### Rollback/Cleanup
- Return the chooser to the original folder if the test changed the selected project path

---

### Terminal quick commands from project files

#### Feature/Change Name
Terminal quick commands are discovered from the current project instead of using a static built-in npm list.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:5174` or the active Vite dev URL
2. Open a thread or new chat whose working directory has a `package.json` with scripts
3. Optionally create executable candidates under the project root and `scripts/`, such as `check.sh`, `scripts/check.sh`, or `scripts/build.cmd`
4. Optionally add `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `bun.lockb` to verify package-manager detection
5. Optionally add a `Makefile` with simple targets such as `test:` or `build:`

#### Steps
1. Open the terminal panel for that project
2. Open the `Run...` dropdown
3. Verify each `package.json` script appears with the detected package manager, such as `pnpm run <script>`, `yarn <script>`, `bun run <script>`, or `npm run <script>`
4. Verify simple `Makefile` targets appear as `make <target>`
5. Verify root-level `*.sh` / `*.cmd` files appear as `./<file>`
6. Verify `scripts/*.sh` and `scripts/*.cmd` files appear as `./scripts/<file>`
7. Select one discovered command and confirm it is sent to the terminal
8. Reopen the dropdown after running commands multiple times
9. If the project has more commands than fit in the menu, scroll the dropdown and verify lower-priority entries such as `./scripts/<file>.sh` remain reachable
10. From a closed terminal state on a remote server, select a command immediately after opening the `Run...` menu and confirm it runs after the terminal attaches

#### Expected Results
- The dropdown is based on the current project `cwd`
- Static defaults like `npm run dev` do not appear unless they exist in that project's `package.json`
- Package script commands use the lockfile-preferred package manager
- Make targets are listed after package scripts
- Root and `scripts/` script-file commands are listed after Make targets
- Commands are sorted by most-used and then most-recent usage, and the dropdown scrolls instead of hiding entries beyond the first five
- Selecting a command while the terminal is still mounting waits for the attach flow instead of dropping the command

#### Rollback/Cleanup
- Remove any temporary files created under the project root or `scripts/`

---

### Backend-persisted queued messages and drag reorder

#### Feature/Change Name
Queued messages are saved through the backend, survive page refresh, and can be reordered by dragging a queued row before another queued row.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a thread where a turn is actively running
3. Queue at least three messages while the turn is running
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, confirm each queued row has a drag handle at the start of the row
2. Refresh the page and reopen the same thread
3. Confirm all queued rows are still visible in the same order
4. Drag the third queued message onto the first queued message
5. Confirm the third message moves to the first position and the remaining queued messages keep their relative order
6. Refresh again and confirm the reordered queue order is preserved
7. Let the active turn finish and confirm the next sent queued message is the first reordered item
8. Queue at least two more messages, switch to dark theme, and repeat the drag reorder check

#### Expected Results
- Queued rows survive a page refresh because they are restored from backend state
- Dragging a queued row onto another queued row immediately reorders the queue
- The reordered queue order survives page refresh
- The reordered queue order controls which message sends next after the active turn finishes
- Edit, Steer, and Delete actions still operate on the correct queued row after reordering
- Drag handle, hover/drop target, and row text remain readable in both light theme and dark theme

#### Rollback/Cleanup
- Delete any queued test messages that should not be sent

---

### Sidebar chats show more projectless chats

#### Feature/Change Name
The sidebar Chats section lists the first 10 projectless chats, offers Show more for the rest, and no longer shows the per-section filter button.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Thread history contains more than 10 projectless chats
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the sidebar Chats section.
2. Count the visible projectless chat rows and confirm only 10 rows are shown initially.
3. Click Show more and confirm older projectless chat rows beyond the first 10 appear.
4. Click Show less and confirm the Chats section returns to 10 visible rows.
5. Confirm the Chats section header only shows the New chat action and does not show a filter button.
6. Use the main sidebar search button and confirm global thread search still opens and filters chats/projects without the 10-row browsing limit.
7. Switch to dark theme and repeat steps 1-6.

#### Expected Results
- The Chats section shows 10 projectless chats by default according to the selected chat sort mode.
- Show more expands the section to all projectless chats, and Show less restores the 10-row default.
- The Chats header does not include a filter action.
- The New chat action remains available.
- The main sidebar search remains functional.
- Rows and header actions remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---

### Codex.app 风格 Composer 模型与上下文用量

#### Feature/Change Name
Composer 输入框右下角模型选择、上下文用量位置与 Codex.app 视觉对齐。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 至少有一个线程产生过 token usage，或可通过测试环境注入 `threadTokenUsage` 验证上下文用量展示。

#### Steps
1. 在浅色主题下打开首页或任意线程路由。
2. 确认 composer 输入框一行起步，整体高度比旧版更接近 Codex.app 的紧凑圆角输入面板。
3. 确认左下角只保留附件、技能和 Thinking 控制，模型选择不再出现在左侧控制组。
4. 确认模型选择显示在右下角操作组内，并位于语音输入按钮左侧。
5. 在线程有上下文用量数据时，确认上下文用量圆形指示器显示在模型选择和语音输入按钮之间，圆环按已用比例着色。
6. 悬停上下文用量圆形指示器，确认浮层包含背景信息窗口、已用百分比、当前上下文 token、上一轮和会话总量摘要。
7. 切换到深色主题，重复步骤 2 到 6。
8. 使用 375px 宽度视口检查 composer，确认模型、上下文用量、语音和发送按钮在 shell 内换行/收缩，不与左右控制重叠。

#### Expected Results
- 浅色和深色主题下，composer shell、输入区域、模型选择、上下文用量、语音按钮和发送按钮均可读。
- 模型选择位于右下角操作组，视觉顺序为模型、上下文用量圆环、语音、发送。
- 无 token usage 数据时，上下文用量圆环隐藏；有数据时显示紧凑圆环和 hover 详情，不挤压输入文本。
- 375px 宽度下，右侧操作组保持在 composer shell 内，文本不会溢出或遮挡其他控件。

#### Rollback/Cleanup
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。
- 如果测试时注入了本地 token usage 数据，删除 `codex-web-local.thread-token-usage.v1`。

---

### Codex.app 风格右侧常驻窗口与背景信息圆环

#### Feature/Change Name
Codex.app pinned summary 风格右侧常驻窗口、分支入口迁移、背景信息圆环 hover 详情。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 至少有一个 Git 线程或 Git 项目可用于确认分支下拉；若没有 Git 数据，确认 Git 分区显示无仓库状态。
4. 至少有一个线程产生过 token usage，或可通过测试环境注入 `threadTokenUsage` 验证背景信息圆环。

#### Steps
1. 在浅色主题打开首页或线程路由，确认右上角显示常驻窗口开关。
2. 确认常驻窗口打开时位于右侧；无 plan 进度时只显示环境和来源，有进度时分区顺序为环境、进度、来源。
3. 点击右上角开关，确认常驻窗口隐藏；再次点击，确认常驻窗口恢复。
4. 在线程或 Git 项目路由中确认原右上角分支按钮不再出现在 header，而是位于常驻窗口的 Git 分区内，并且仍可打开分支/commit 下拉。
5. 有 token usage 数据时，在 composer 右下角确认背景信息以圆形指示器展示，并位于模型选择与语音按钮之间。
6. 悬停圆形指示器，确认浮层展示背景信息窗口、已用百分比、已用/总 token、上一轮和会话累计信息。
7. 切换到深色主题，重复步骤 1 到 6，确认常驻窗口、分区线、圆环和 hover 浮层均使用深色 surface。
8. 使用 375px 宽度视口打开常驻窗口，确认它以右侧浮层展示，不遮挡顶部 header 和底部 composer，文本不溢出。

#### Expected Results
- 右上角只有常驻窗口开关；分支入口迁移到右侧常驻窗口内。
- 常驻窗口宽度、圆角、分区密度接近 Codex.app pinned summary，浅色和深色主题下均可读。
- 常驻窗口隐藏/显示状态会保存在 `codex-web-local.inspector-panel-open.v1`。
- 进度分区不会在无 plan 时显示，也不会显示后台任务占位。
- 背景信息圆环无 token usage 时隐藏，有数据时显示已用百分比并在 hover/focus 时显示具体信息。
- 移动/窄屏下常驻窗口以浮层形式出现，内容不与 composer 控件重叠。

#### Rollback/Cleanup
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。
- 如果测试时修改了常驻窗口偏好，删除 `codex-web-local.inspector-panel-open.v1`。
- 如果测试时注入了 token usage fixture，刷新页面即可清除组件内临时注入状态。

---

### Plan 生成居中与 Inspector 进度

#### Feature/Change Name
Plan 模式生成中的实时卡片保持在消息流中间，右侧 inspector 显示真实步骤进度。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 右侧 inspector 已打开，当前线程可发送 Plan 模式消息，并能点击生成后的 `Implement plan`。

#### Steps
1. 在浅色主题打开一个线程，确认右侧 inspector 显示 Git/来源区域。
2. 切换 composer 到 Plan 模式并发送一个会生成多步计划的提示。
3. 在生成过程中观察 Plan 卡片，确认它从一开始就在消息流中间显示，不出现在右上角。
4. 保持滚动位于底部，等待计划内容持续生成，确认页面随内容向下跟随。
5. 观察右侧 inspector 的进度分区，确认步骤随 `turn/plan/updated` 逐步打勾。
6. 计划完成后，确认 inspector 进度自动折叠，然后点击最终 Plan 卡片中的 `Implement plan`。
7. 确认执行阶段 inspector 不会被右上 Plan 浮窗替换或隐藏。
8. 切换到深色主题，重复步骤 1 到 7。

#### Expected Results
- 浅色和深色主题下，生成中的 Plan 卡片都在消息流中间显示，并保持可读样式。
- 自动跟随开启时，生成内容增长会持续向下滚动；用户手动上滚后不会强制抢回到底部。
- inspector 的持久开关不被改写，Plan 进度只作为中间分区出现并在完成后折叠。

#### Rollback/Cleanup
- 删除测试线程或测试消息（如有需要）。
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。
- 如果测试时关闭了 inspector，可重新点击右上 inspector 按钮恢复。

---
