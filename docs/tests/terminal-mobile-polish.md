# 终端、移动端与视觉打磨

Integrated terminal、移动端交互、主题、视觉 token、图标、字体和布局细节。

> 本文件由根目录 `tests.md` 拆分而来，保留原有手动验证步骤。

### Feature: Codex Desktop sidebar navigation and message hover actions

#### Prerequisites
- App is running from this repository.
- A thread list has enough projects/chats to scroll the left sidebar.
- A thread contains user and assistant messages with editable, copyable, and forkable actions.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the app in light theme and scroll the left thread list.
2. Confirm the top sidebar navigation stays fixed while projects/chats scroll underneath.
3. Confirm the top navigation order is `新会话`, `搜索会话`, `自动化`.
4. Click `新会话` and confirm it starts the existing new-thread flow.
5. Click `搜索会话`, confirm the existing thread filter input appears, type a query, clear it, and close/reopen the search row.
6. Hover a project row and confirm the `...` and new-thread compose buttons appear only on hover/focus or while the menu is open.
7. Hover a thread row and confirm the relative time is replaced by edit and `...` controls; click edit and confirm the existing rename dialog opens.
8. Hover user and assistant messages and confirm the toolbar shows time, copy, and the expected edit or fork action without layout shift.
9. Click copy on a user message and an assistant response and confirm the copied state appears briefly.
10. Switch to dark theme and repeat steps 1-9.

#### Expected Results
- The sidebar top navigation does not scroll with the thread list.
- Search and new-thread icon buttons beside the old search bar are gone.
- The new-thread compose, edit, copy, fork, and `...` icons use local Codex SVGs and consistent 16px visual sizing inside stable 24px hitboxes.
- Row controls only appear on hover/focus or while their menu/dialog trigger is active.
- Message time is shown only when a reliable timestamp is available.

#### Rollback/Cleanup
- Clear the search query and restore the preferred theme.

### Feature: Codex Desktop message action icons

#### Prerequisites
- App is running from this repository.
- A thread contains at least one assistant response with copy and fork actions.
- Light and dark themes are both available from Settings.

#### Steps
1. Open a thread in light theme and hover an assistant response.
2. Confirm the copy and fork action icons render at the same visual size as Codex Desktop `icon-xs`.
3. Confirm the fork action uses the Codex Desktop worktree/fork glyph, not the branch glyph.
4. Confirm the action buttons keep their original hitbox and hover/focus state.
5. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- Copy and fork icons render as 16px icons inside stable 24px action buttons.
- The edit icon remains unchanged.
- Hovering the action row does not shift message layout.

#### Rollback/Cleanup
- Restore the preferred theme.

### Feature: Project recency sort, pins, and mobile move mode

#### Prerequisites
- App is running from this repository on `feature/project-recency-sort-upstream`.
- At least two visible projects exist with threads updated at different times.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the sidebar in light theme.
2. Open Projects -> Organize and confirm `Recent projects` is selected by default.
3. Confirm projects appear in descending recent thread activity order.
4. Tap the Projects header reorder icon and confirm move mode starts, all current project thread lists collapse, and drag handles are visible.
5. Drag a non-top project above the first project while still in recent mode.
6. Confirm the moved project appears in the pinned prefix, recent mode remains selected, and project threads do not expand from the drag release.
7. Tap `Done`, open the moved project's menu, choose `Unpin project`, and confirm it returns to its recency-derived position.
8. Switch to `Manual project order`, drag a project, and confirm the manual order sticks independently of recent-mode pins.
9. Enter sidebar search text and confirm project move mode/dragging cannot start while the project list is filtered.
10. Repeat steps 1-9 in dark theme.

#### Expected Results
- Recent mode ignores saved manual `projectOrder` except for explicit pinned project overrides.
- Recent-mode drags pin the moved project without switching the persisted sort mode to manual.
- Recent-mode drag and pin actions update only the pinned project override list and do not rewrite saved manual order.
- Unpinning removes the override and restores the project to recency order.
- Manual project order remains a separate full-list ordering mode.
- Move mode collapses project thread lists, restores prior expansion state on exit, and is blocked while search filters the sidebar.
- Reorder icon, `Done`, drag handles, pin labels, and menus remain readable in light and dark themes.

#### Rollback/Cleanup
- Tap `Done` to leave move mode.
- Reset the sidebar Organize menu to the preferred project sort mode.
- Remove any temporary chats or workspace roots created for verification.

### Feature: Telegram bot token stored in dedicated global file

#### Prerequisites
- App server is running from this repository.
- A valid Telegram bot token is available.
- At least one Telegram user ID is available for allowlisting.
- Access to `~/.codex/` on the host machine.

#### Steps
1. In the app UI, open Telegram connection and submit a bot token plus one or more allowed Telegram user IDs.
2. Verify file `~/.codex/telegram-bridge.json` exists.
3. Open `~/.codex/telegram-bridge.json` and confirm it contains `botToken` and `allowedUserIds` fields.
4. Restart the app server and call Telegram status endpoint from UI to confirm it still reports configured.

#### Expected Results
- Telegram token is persisted in `~/.codex/telegram-bridge.json`.
- Telegram allowlisted user IDs are persisted in `~/.codex/telegram-bridge.json`.
- Telegram bridge remains configured after restart.

#### Rollback/Cleanup
- Remove `~/.codex/telegram-bridge.json` to clear saved Telegram token.

### Project automation and composer reliability fixes

#### Feature/Change Name
Project automation delete failure handling and coalesced composer overflow measurement.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. At least one sidebar project with a configured project automation
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, temporarily make `DELETE /codex-api/project-automation` fail, for example by stopping the local API bridge or forcing a 500 response in a development proxy.
2. Open the project menu for a project with an automation and click Remove.
3. Confirm the sidebar does not trigger an unhandled promise rejection and shows a small project automation error message.
4. Restore the API bridge and refresh project automations.
5. Confirm the automation chip/server state is reloaded instead of staying optimistically removed.
6. Type a long draft in the composer and confirm the expand control still appears when the textarea overflows.
7. Switch to dark theme and repeat steps 2-6.

#### Expected Results
- Project automation delete failures are caught and surfaced as a visible sidebar error.
- Automation state is restored or reloaded after a failed delete.
- Composer overflow checks remain functional without scheduling duplicate same-tick measurements.
- The sidebar error message remains readable in light theme and dark theme.

#### Rollback/Cleanup
- Restore any temporary API failure/proxy change.

---

### Revert PR 131 project recency and mobile move mode

#### Feature/Change Name
PR #131 revert: remove project recency ordering and mobile project move mode while preserving later sidebar actions.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar has at least two projects and projectless chats
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the sidebar Projects section.
2. Open the Projects organize menu.
3. Confirm the menu still exposes thread organization and chat sort controls, but does not expose project recency/manual sort controls.
4. Open a project action menu and confirm browse, rename, remove, worktree, and git status actions still behave normally.
5. On a mobile-sized viewport, confirm there is no project move mode affordance or drag handle from PR #131.
6. Switch to dark theme and repeat steps 1-5.

#### Expected Results
- Project recency/manual sort controls from PR #131 are absent.
- Project pinning/move mode controls from PR #131 are absent.
- Existing sidebar project actions and git-status menu behavior remain available.
- Sidebar rows, menus, and actions remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---

### Feature: Revert PR #16 mobile viewport and chat scroll behavior changes

### Feature: Revert Renat scrolling/input-layout behavior (without Fast mode changes)

#### Prerequisites
- App builds successfully (`pnpm run build`).
- Open a thread with enough messages to scroll.
- Composer is visible in the main chat view.

#### Steps
1. Open a long thread and scroll upward away from bottom.
2. Trigger live overlay updates (for example by sending a new prompt) and observe scroll behavior.
3. Confirm message list horizontal overflow behavior in conversation and desktop main area.
4. In composer, verify there is no drag/drop overlay UI when dragging files over the input.
5. In composer, paste an image from clipboard and verify it is not auto-attached through paste handler.
6. Use file picker/camera attach buttons and confirm attachments still work.
7. Confirm Fast mode UI/toggle remains present and unchanged.

#### Expected Results
- Scroll behavior follows reverted layout logic for conversation/desktop containers.
- Composer drag-active overlay is removed from the input field layout.
- Clipboard image paste no longer triggers drag/paste attachment flow.
- Standard picker-based attachments still work.
- Fast mode button and related controls are unchanged.

#### Rollback/Cleanup
- `git restore src/components/content/ThreadComposer.vue src/components/content/ThreadConversation.vue src/components/layout/DesktopLayout.vue src/style.css tests.md`

### Feature: Dark theme command rows in chat remain readable

#### Prerequisites
- App is running from this repository.
- Open any thread that contains command execution entries.
- Appearance is set to `Dark` in Settings.

#### Steps
1. Open a thread with one or more command execution rows in the conversation.
2. Verify command label text, grouped command label text, and status text in collapsed rows.
3. Locate a file-change summary row (for example: `▶ 2 files changed +12 -3`) and verify the chevron and summary text are readable.
4. Expand a command row to show output and inspect the output panel border contrast.
5. Confirm status colors for running/success/error command rows are distinguishable in dark mode.
6. Toggle back to `Light` theme and confirm command rows still use the existing light styling.

#### Expected Results
- Command labels and grouped command labels are readable against dark row backgrounds.
- File-change summary rows keep readable chevron and summary text in dark mode.
- Default status text is readable in dark mode.
- Running/success/error status colors remain visible in dark mode.
- Expanded command output border is visible without using a bright light-theme border.
- Light theme command row styling is unchanged.

#### Rollback/Cleanup
- Return appearance setting to the previous user preference.

### Feature: Home composer vertical alignment matches reference layout

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open the `New thread` (home) screen with a selected folder/project.
- Ensure desktop viewport width (for example >= 1280px).

#### Steps
1. Open the home screen and observe the hero block (`Let's build`) and composer placement.
2. Confirm the hero/settings block is vertically centered within the available content area.
3. Confirm the message composer sits in the lower area of the content column (not immediately below top content).
4. Resize window height taller/shorter and re-check vertical placement.
5. Open any thread route and verify thread composer layout remains unchanged.

#### Expected Results
- Home hero block is centered again (not top-anchored).
- Home composer aligns toward the bottom region similar to the reference screenshot.
- Resizing preserves the intended centered-hero + lower-composer structure.
- Thread route composer behavior is unchanged.

#### Rollback/Cleanup
- Revert the `.new-thread-empty` style in [src/App.vue](/Users/igor/.codex/worktrees/eaf8/codex-web-local/src/App.vue).

### Feature: Restore composer drag-and-drop file attach on input field

#### Prerequisites
- App is running with a selected thread and active composer.
- At least one local file is available to drag from Finder/File Explorer.

#### Steps
1. Drag a file over the composer input area.
2. Confirm drag highlight/overlay appears above the input.
3. Drop the file on the composer input field.
4. Verify the file is attached in composer chips.
5. Repeat with an image file and verify image preview appears.
6. In dark mode, repeat steps 1-2 and verify overlay remains readable.

#### Expected Results
- Composer shows drag-active visual state while file is hovering.
- Dropped files are attached through the same attachment pipeline as regular uploads.
- Image drops create image preview attachments.
- Dark mode drag overlay uses dark-theme colors and remains legible.

#### Rollback/Cleanup
- Remove attached files/images from the composer before closing the test thread.

### Feature: Restore clipboard image paste attachments in composer

#### Prerequisites
- Start the app from this repository (`pnpm run dev`).
- Open any thread where the composer is enabled.
- Have an image copied to system clipboard (for example screenshot copy).

#### Steps
1. Focus the composer textarea.
2. Paste clipboard content that contains only an image file payload.
3. Confirm an image chip/preview is added to composer attachments.
4. Copy plain text only and paste into composer.
5. Copy mixed content (plain text + image, if source provides both) and paste once.
6. Copy long plain text (at least 2000 characters) and paste into composer.
7. Confirm the long text is attached as a `.txt` file instead of being inserted into the textarea.
8. Send the message with the pasted image/text attachment.

#### Expected Results
- Image-only clipboard paste adds an image attachment to composer.
- Plain-text paste still inserts text into the composer and does not create an attachment.
- Mixed payload paste attaches the image while preserving text paste behavior.
- Long plain-text paste (>= 2000 chars) creates a `.txt` attachment and does not insert raw text into the textarea.
- Sending proceeds with the attached pasted image.

#### Rollback/Cleanup
- Remove the attached image chip from composer if not needed.

### Integrated terminal mobile keyboard avoidance

#### Feature/Change Name
The integrated terminal stays inside the visible viewport when the mobile virtual keyboard opens.

#### Prerequisites/Setup
1. Dev server running on a phone-accessible URL
2. Open a thread or new-chat screen with a selected project folder
3. Integrated terminal available from the header terminal button

#### Steps
1. Open the terminal drawer
2. Tap inside the xterm terminal so the mobile keyboard opens
3. Type `echo terminal-keyboard-ok`
4. Rotate or resize the browser while the keyboard is still open
5. Repeat on a wide/tablet layout where the sidebar remains visible
6. Hide the keyboard, then tap the terminal again

#### Expected Results
- The terminal panel resizes into the visual viewport instead of being covered by the keyboard
- The xterm prompt and typed command remain visible above the keyboard
- The composer/terminal stack stays compact without overlapping the header or conversation
- On wide/tablet layouts, terminal focus still activates the protected keyboard layout even when the mobile breakpoint is not active
- The terminal remains usable after resize/orientation changes

#### Rollback/Cleanup
- Close the terminal tab if the test created a shell session that should not remain running

---

### Codex.app-style integrated terminal

#### Feature/Change Name
Each local/worktree thread has an integrated xterm terminal that can be toggled from the header, uses the thread working directory, preserves recent output, and exposes a terminal snapshot endpoint.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. An existing local or worktree thread with a valid working directory
3. Browser focused on that thread

#### Steps
1. Click the terminal button in the top-right thread header
2. Confirm the bottom terminal drawer opens
3. Press `Cmd+J` on macOS or `Ctrl+J` on other platforms
4. Confirm the terminal drawer toggles closed/open
5. Run `pwd`
6. Confirm the printed path matches the thread/project working directory
7. Run `echo terminal-ok`
8. Confirm `terminal-ok` appears in the xterm output
9. Choose `npm run dev` from the `Run...` quick-command menu
10. Confirm the command is submitted to the active terminal
11. Fetch `/codex-api/thread-terminal-snapshot?threadId=<thread-id>`
12. Confirm the JSON `session.buffer` contains `terminal-ok`
13. Refresh the page and reopen the same thread
14. Toggle the terminal open again
15. Click `New`
16. Confirm a second terminal tab appears and becomes active
17. Click the first terminal tab
18. Confirm its previous output is restored
19. Resize the browser window
20. Click `Close`
21. Open the new-chat screen
22. Confirm a working folder is selected
23. Click the terminal button in the top-right header
24. Confirm the terminal opens below the new-chat composer before a thread exists
25. Run `pwd` and confirm it matches the selected folder

#### Expected Results
- The terminal button shows a pressed state when the drawer is open
- The terminal is scoped to the selected thread working directory
- The terminal button is also available on new-chat when a working folder is selected
- New-chat terminal sessions use the selected folder before a thread exists
- Recent output is restored after hiding/reopening or refreshing the thread
- The terminal resizes without clipping the prompt
- The snapshot endpoint returns `{ session: { cwd, shell, buffer, truncated } }` while a session exists
- The quick-command menu sends common project commands such as `npm run dev` into the current PTY
- The terminal open/hide action is the first item in the `Run...` menu
- The `Run...` menu shows discovered project commands in usage order and scrolls when the list is longer than the visible menu
- `New` adds another tab without killing the previous PTY
- `Close` terminates the active PTY and hides the drawer only after the last tab is closed

#### Rollback/Cleanup
- Close the terminal session with the `Close` button
- Stop any processes started inside the terminal before leaving the thread

---

### Integrated terminal manager edge cases

#### Feature/Change Name
Automated unit coverage for terminal manager edge cases that do not require a browser or real shell.

#### Prerequisites/Setup
1. Dependencies installed with `pnpm install`

#### Steps
1. Run `pnpm run test:unit`
2. Optionally run the focused test file with `pnpm run test:unit -- src/server/terminalManager.test.ts`

#### Expected Results
- Missing thread ids are rejected before spawning a PTY
- Invalid cwd falls back to home and then process cwd
- Initial and resize dimensions are clamped
- PTY env normalizes `TERM`, locale, and strips `TERMINFO` variables
- Output snapshots truncate to the last 16 KiB and set `truncated`
- Existing session reattach emits init/attached events and safely syncs changed cwd
- `New` adds a new tab without killing the previous session, and close/exit removes snapshots for the active session

#### Rollback/Cleanup
- None

---

### Content header actions remain right aligned

#### Feature/Change Name
Thread and new-chat header action buttons stay pinned to the right edge while long titles remain constrained and truncated.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Sidebar collapsed or viewport wide enough to show content header actions
3. Terminal toggle available in the header

#### Steps
1. Open `http://127.0.0.1:4173/#/`
2. Inspect the header row containing `Start new thread`
3. Verify the terminal toggle is aligned to the far right of the content header, not immediately after the title
4. Open a thread with a long title and repeat the alignment check
5. Confirm the title truncates with a tooltip and does not overlap the terminal or branch controls

#### Expected Results
- Header actions use the available right edge of the content header
- Long title truncation does not pull action buttons toward the center
- Terminal and branch controls remain visible and clickable

#### Rollback/Cleanup
- Remove generated screenshots under `output/playwright/` if they are not needed

---

### Dark theme plan card contrast

#### Feature/Change Name
Plan cards in dark mode keep readable contrast and a lighter surface than the surrounding page background, including the `Implement plan` action.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. A thread contains a visible plan card
3. Appearance is set to `Dark`

#### Steps
1. Open a thread containing a plan card in dark mode
2. Inspect the card background, title, explanation text, headings, lists, inline code, and blockquote styling
3. Verify the `Implement plan` button is readable and visually distinct
4. Hover the `Implement plan` button and confirm the hover state remains visible

#### Expected Results
- The plan card surface is distinguishable from the page background without looking crushed into near-black
- Plan text and headings stay readable in dark mode
- Inline code, file links, and blockquotes keep enough contrast to scan comfortably
- The `Implement plan` button remains readable and clickable in dark mode

#### Rollback/Cleanup
- Reset appearance to the previous user preference

---

### Codex.app 风格桌面外壳视觉 token

#### Feature/Change Name
Codex.app 桌面外壳 token、主内容 surface、工具栏高度和默认侧栏宽度对齐。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. localStorage 中没有已保存的 `codex-web-local.sidebar-width.v1`，或在检查默认宽度前先删除它。

#### Steps
1. 在浅色主题下打开首页路由 `http://127.0.0.1:4173/#/`。
2. 确认未保存宽度时，侧栏默认宽度约为 `300px`。
3. 确认主内容 surface 紧跟侧栏 resize 热区之后，并带有左侧圆角。
4. 确认内容顶部工具栏高度约为 `46px`。
5. 确认 resize handle 默认视觉上保持安静，只在 hover/focus 时显示轻微分隔线。
6. 切换到深色主题，重复步骤 1 到 5。
7. 拖拽调整侧栏宽度，刷新页面，确认保存的宽度能恢复，并且仍被限制在桌面宽度范围内。

#### Expected Results
- 浅色主题使用白色主 surface，并位于很浅的 sidebar/surface-under 背景上。
- 深色主题使用 `#191919` 的 sidebar/surface-under 背景，以及 `#1e1e1e` 的主 surface。
- 两种主题下，主 surface 左侧圆角接近 `12.5px`，并带有轻微 `0.5px` ring/shadow。
- 未保存宽度时，侧栏默认宽度为 `300px`，比之前落到最小宽度的行为更接近 Codex.app 桌面端参照。
- 浅色和深色主题下 UI 均可读，文本不发生重叠。

#### Rollback/Cleanup
- 如果手动测试修改了本地偏好，从 localStorage 删除 `codex-web-local.sidebar-width.v1` 和 `codex-web-local.dark-mode.v1`。

---

### 历史输入编辑取消与提示条贴合

#### Feature/Change Name
编辑历史用户输入时，取消编辑不会回滚线程，并且“正在编辑消息”提示条与输入框顶部无断层贴合。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 打开一个至少包含一条已完成用户消息和助手回复的线程。

#### Steps
1. 在浅色主题打开目标线程。
2. 在 composer 输入一段未发送草稿，例如 `draft before edit`。
3. 悬停历史用户消息，点击编辑按钮。
4. 若出现替换草稿确认框，选择确认。
5. 确认 composer 上方出现“正在编辑消息”提示条，且提示条下边与输入框上边直接贴合，没有额外空白断层。
6. 修改 composer 中的编辑文本，但不要发送。
7. 点击“取消”。
8. 确认历史消息和其后的助手回复仍保留，composer 恢复步骤 2 的原草稿。
9. 再次点击同一条历史用户消息的编辑按钮，修改文本后发送。
10. 确认只有发送后才回滚到该 turn，并用编辑后的文本开始新 turn。
11. 切换到深色主题，重复步骤 2 到 8。

#### Expected Results
- 浅色和深色主题下，编辑提示条和取消按钮均可读、可点击。
- 提示条与输入框顶部连续衔接，不存在视觉断层或额外垂直空白。
- 点击历史输入的编辑按钮不会立即回滚线程。
- 取消编辑会退出编辑态并恢复进入编辑前的 composer 草稿。
- 发送编辑内容后才执行历史回滚，并继续发送编辑后的消息。

#### Rollback/Cleanup
- 删除测试线程或测试消息（如有需要）。
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。

---

### 中文输入法 Enter 确认不误发送

#### Feature/Change Name
Composer 在中文输入法组合输入期间忽略 `Enter` 发送快捷键。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 打开一个可发送消息的线程。
4. 系统已启用中文输入法，例如拼音输入法。

#### Steps
1. 在浅色主题打开线程，确认侧边栏设置中 `Require ⌘ + enter to send` 已关闭，即按 `Enter` 发送。
2. 聚焦 composer 输入框，切换到中文输入法。
3. 输入一段拼音并在候选组合态中按第一次 `Enter` 确认英文或候选文本。
4. 确认消息没有被发送，文本仍保留在输入框中。
5. 在输入法组合态结束后再次按 `Enter`。
6. 确认此时才发送 composer 中的文本。
7. 切换到深色主题，重复步骤 2 到 6。

#### Expected Results
- 浅色和深色主题下，输入法候选确认时的第一次 `Enter` 只提交输入法内容，不触发发送。
- 组合输入结束后的普通 `Enter` 仍按当前设置发送消息。
- 文件提及菜单打开时，输入法组合态 `Enter` 也不会误选提及项或关闭菜单。

#### Rollback/Cleanup
- 删除测试线程或测试消息（如有需要）。
- 如果测试时修改了发送快捷键设置，恢复 `codex-web-local.send-with-enter.v1`。
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。

---

### Codex Desktop 暗色主题 token 对齐

#### Feature/Change Name
共享暗色表面参考 `codex-theme-v1`，减少 `zinc-*` 局部黑块和偏冷灰色。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 有一个 Git 线程或 Git 项目可用于打开右侧 inspector 的 Git 分支下拉。

#### Steps
1. 在浅色主题打开线程，确认右侧 inspector、设置面板、Git 分支下拉和普通 composer dropdown 仍保持原浅色视觉。
2. 切换到深色主题。
3. 确认页面主背景、右侧 inspector 背景、侧边栏背景都接近 Codex Desktop `surface #1e1e1e`，没有明显纯黑或偏蓝紫黑的突兀块。
4. 打开右侧 inspector 的 Git 分支下拉，确认菜单背景、搜索框、当前分支、hover 项都使用统一暗色 surface/selection，而不是 `zinc-900` 黑块。
5. 打开侧边栏设置面板，确认面板、账号卡片、搜索框和按钮的背景与边框使用同一套暗色层级。
6. 打开一个 composer dropdown，确认弹层、hover、selected 状态与 Git 下拉的暗色层级一致。

#### Expected Results
- 浅色主题没有回归。
- 深色主题核心表面仍接近 `codex-theme-v1` 的 surface `#1e1e1e`，文字和链接蓝采用 VS Code Default Dark Modern 的 `#cccccc`、`#9d9d9d`、`#4daafc`、`#0078d4`。
- 右侧 inspector、Git 菜单、设置面板和通用 dropdown 不再出现明显偏黑/偏冷的孤立色块。
- Hover/selected 状态仍有足够对比度，并且文本可读。

#### Rollback/Cleanup
- 如果测试时切换了分支，切回原分支。
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。

---

### Codex Desktop 字体与聊天排版对齐

#### Feature/Change Name
参考 Codex Desktop VS Code Plus 主题与 `codexie` webview token，收敛全局 UI 字体、代码字体和聊天正文行高。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 打开一个包含普通文本、列表、引用、inline code、代码块和 composer 输入内容的线程。

#### Steps
1. 在浅色主题打开线程，确认侧边栏、标题栏、消息正文和 composer 输入框使用系统 UI 字体，字号接近 Codex Desktop 的 14px。
2. 查看普通消息段落、列表、引用和 worked separator，确认行距稳定接近 1.5，不显得过松或偏粗。
3. 查看 inline code 和代码块，确认使用 `ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` 风格，字号接近 12px。
4. 在 composer 输入一段中英文混合内容，确认输入文字与已发送消息的字体和行高一致。
5. 切换到深色主题，重复步骤 1 到 4。

#### Expected Results
- 浅色和深色主题下，UI 字体栈与 Codex Desktop 默认 `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` 对齐。
- 聊天正文、列表、引用和 composer 输入框保持 14px / 1.5 的稳定排版。
- inline code 和代码块保持 12px monospace，不因正文相对字号叠加而显得偏小或偏松。
- 深色主题下，文字颜色保持 VS Code Default Dark Modern `foreground #cccccc` 附近的可读对比度。

#### Rollback/Cleanup
- 删除测试消息（如有需要）。
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。

---

### Codex 本地图标替换

#### Feature/Change Name
明确等价的 Tabler 操作图标替换为从 Codex.app 资源抽取的本地 `IconCodex*` 组件。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 5173`
2. 浏览器可以打开 `http://127.0.0.1:5173/#/`
3. 至少存在一个线程、一个项目分组、一个 Git 项目和一个可打开的 Skills 页面。

#### Steps
1. 在浅色主题查看侧边栏搜索、设置、线程行更多菜单、删除按钮、项目展开/折叠、worktree 标记和自动化标记。
2. 打开一个线程，查看消息编辑、fork、复制、关闭、跳到底部、composer 发送、停止、展开/收起、文件和文件夹 chip 图标。
3. 打开 Git 分支下拉、runtime 下拉、搜索下拉和模型下拉，确认 chevron、branch、worktree、terminal、fast mode 图标正常显示。
4. 打开 `/skills` 和技能详情弹窗，确认分组 chevron、文件夹和关闭图标正常显示。
5. 打开 `/automations`，确认空状态、列表状态和暂停状态图标正常显示。
6. 切换到深色主题，重复步骤 1-5。

#### Expected Results
- 已替换图标均来自本地 `src/components/icons/codex`，没有出现缺失、变形、错位或颜色不可读。
- 浅色和深色主题下图标继承当前文字颜色，hover、selected、disabled 状态保持可辨识。
- 麦克风和 inspector 侧栏布局图标继续使用原 Tabler 图标，因为本轮没有确认 Codex.app 中的一一等价项。

#### Rollback/Cleanup
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。

---

### 状态圆点统一为 VS Code 蓝

#### Feature/Change Name
左侧线程未读圆点和右侧 Git 本地变更圆点统一使用 `#0078d5`。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 至少有一个未读线程，当前项目存在 Git 本地变更。

#### Steps
1. 在浅色主题查看左侧线程列表，确认未读线程圆点显示为 `#0078d5` 蓝色。
2. 在浅色主题打开右侧 inspector 的 Git 区域，确认本地变更圆点显示为 `#0078d5` 蓝色。
3. 切换到深色主题，重复步骤 1 和 2。
4. hover 线程行、打开 Git 分支下拉，确认圆点颜色不变且仍清晰可见。

#### Expected Results
- 左侧未读线程圆点和右侧 Git 本地变更圆点颜色一致，均为 `#0078d5`。
- 浅色和深色主题下圆点都清晰，不再出现蓝点/黄点混用。
- hover、focus、菜单打开状态不会改变这两个圆点的颜色。

#### Rollback/Cleanup
- 如果测试时制造了本地 Git 变更，自行清理测试改动。
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。

---

### VS Code Default Dark Modern 字体颜色对齐

#### Feature/Change Name
深色主题文字、次级文字、链接蓝和焦点蓝采用 VS Code Default Dark Modern 语义颜色。

#### Prerequisites/Setup
1. 开发服务器已运行：`pnpm run dev --host 127.0.0.1 --port 4173`
2. 浏览器可以打开 `http://127.0.0.1:4173/#/`
3. 打开一个包含普通正文、次级说明、文件链接、hover/selected 状态和代码块的线程。

#### Steps
1. 在浅色主题打开线程，确认正文、链接、按钮和代码块颜色没有异常变化。
2. 切换到深色主题。
3. 确认普通文字接近 VS Code Default Dark Modern `foreground #cccccc`，不再偏亮到 `#d4d4d4`。
4. 确认说明文字、时间、meta 信息接近 `descriptionForeground #9d9d9d`。
5. 查看文件链接、普通 markdown 链接和 hover 状态，确认蓝色接近 `textLink.foreground #4daafc`，没有过度发光或偏紫。
6. 聚焦输入框或可聚焦按钮，确认焦点蓝接近 `focusBorder #0078d4`。
7. 打开分支下拉或含 selected 状态的菜单，确认 selected 背景仍可区分且文字保持可读。

#### Expected Results
- 浅色主题没有回归。
- 深色主题正文、次级文字、链接蓝和焦点蓝与 VS Code Default Dark Modern 语义颜色一致。
- 长文件路径链接在深色背景上仍清晰，但不显得刺眼。
- selected/hover 状态仍有足够对比度。

#### Rollback/Cleanup
- 删除测试消息（如有需要）。
- 如果测试时修改了主题偏好，将 `codex-web-local.dark-mode.v1` 恢复为 `system` 或删除。
