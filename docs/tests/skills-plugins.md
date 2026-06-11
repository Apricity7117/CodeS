# Skills、Plugins 与目录

Skills Hub、skills sync、插件、MCP、Composio、Directory Hub 和应用目录。

> 本文件由根目录 `tests.md` 拆分而来，保留原有手动验证步骤。

### Feature: Skills dropdown closes after selection in composer

#### Prerequisites
- App is running from this repository.
- At least one thread exists and can be selected.
- At least one installed skill is available.

#### Steps
1. Open an existing thread so the message composer is enabled.
2. Click the `Skills` dropdown in the composer footer.
3. Click any skill option in the dropdown list.
4. Re-open the `Skills` dropdown and click the same skill again to unselect it.

#### Expected Results
- The skills dropdown closes immediately after each selection click.
- Selected skill appears as a chip above the composer input when checked.
- Skill chip is removed when the skill is unchecked on the next selection.

#### Rollback/Cleanup
- Remove the selected skill chip(s) before leaving the thread, if needed.

### Feature: Skills Hub local-only installed skills

#### Prerequisites
- App is running from this repository.
- Open the `Skills Hub` view.

#### Steps
1. Open `Skills Hub`.
2. Confirm the page shows only locally installed skills.
3. Confirm there is no remote skill count such as `6818 skills`.
4. Confirm there are no remote browse cards from the OpenClaw catalog.

#### Expected Results
- Skills Hub does not fetch or display the OpenClaw remote skills catalog.
- Only locally installed skills are shown.
- No remote total-count badge is rendered.

#### Rollback/Cleanup
- None.

---

### Composio logged-out connector preview

#### Feature/Change Name
Logged-out Composio tab shows a promotional connector preview with example integrations and clear login/dashboard actions.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. Composio CLI installed
3. Composio CLI logged out (`~/.composio/composio logout`)
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the Directory page and switch to the Composio tab.
2. Confirm the logged-out state shows the connector catalog preview hero instead of a plain empty message.
3. Confirm example connector cards are visible for Gmail, Google Calendar, Reddit, YouTube, Google Drive, and X.
4. Type `reddit` in the Composio search box and confirm the preview cards filter to matching example content.
5. Confirm `Login to Composio` starts the CLI login flow and `Open dashboard` opens the Composio dashboard URL.
6. Switch to dark theme and repeat steps 1-4.

#### Expected Results
- Logged-out users see a richer preview of likely Composio connector value without requiring live catalog data.
- The preview does not claim the example cards are connected; cards are labeled `Preview`.
- Search filters the preview cards while logged out.
- Login and dashboard actions remain available.
- The hero, cards, text, badges, and buttons remain readable in light and dark themes.

#### Rollback/Cleanup
- Re-login to Composio if needed with `~/.composio/composio login --no-browser -y`.

---

### Composer skill chip opens SKILL.md

#### Feature/Change Name
Selected skill labels in the thread composer open that skill's `SKILL.md` in the web file browser.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one installed skill is available in the composer skill picker
3. Browser pop-ups from the local dev origin are allowed
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open any thread with the composer enabled.
2. Open the `Skills` picker and select an installed skill.
3. Confirm the selected skill appears as a green chip above the input field.
4. Click the skill name on the green chip.
5. Confirm a new tab opens to `/codex-local-browse.../SKILL.md` for that skill.
6. Return to the composer and click the chip `x`.
7. Confirm the skill is removed and no file-browser tab is opened by the remove action.
8. Switch to dark theme and repeat steps 2 through 7.

#### Expected Results
- The skill chip label is clickable and opens the selected skill's `SKILL.md` in the web file browser.
- Skill paths that point at a skill directory are normalized to the nested `SKILL.md` file.
- The remove button still only removes the skill from the composer.
- The chip and focus/hover states remain readable in light theme and dark theme.

#### Rollback/Cleanup
- Close any file-browser tabs opened during validation.

---

### Selected skills visible on sent chat messages

#### Feature/Change Name
Selected composer skills are shown as skill chips on the user message after send/history load.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one installed skill is available in the composer `Skills` dropdown
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open an existing thread or start a new thread.
2. Open the composer `Skills` dropdown and select one skill.
3. Type and send a short message.
4. Confirm the sent user message shows a `Skill` chip with the selected skill name.
5. Click the skill chip and confirm the current browser tab opens the skill `SKILL.md` file through the local browse view.
6. Refresh or reopen the thread and confirm the same skill chip remains visible and clickable in history.
7. Switch to dark theme and repeat steps 2-6 with another message.

#### Expected Results
- Selected skills are visible on the user message, not only in the composer before send.
- Skill chips show the skill name and expose the skill path in the tooltip.
- Skill chips link to the selected skill file using the local browse route in the current tab.
- Skill chips remain visible after thread history reload.
- Skill chips are readable in both light and dark themes.

#### Rollback/Cleanup
- Remove disposable test messages/threads if needed.

---

### Session skill recovery cache and multi-message placement

#### Feature/Change Name
Recovered selected-skill metadata is cached per session log and attached to the latest user message in the turn.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. At least one installed skill is available in the composer `Skills` dropdown
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open an existing thread or start a new thread.
2. Select one skill from the composer `Skills` dropdown.
3. Type and send a short message.
4. Refresh or reopen the same thread twice.
5. Confirm the sent user message still shows one skill chip and does not accumulate duplicate chips.
6. Switch to dark theme and repeat steps 2-5 with another message.
7. Run `pnpm vitest run src/server/codexAppServerBridge.inlinePayload.test.ts`.

#### Expected Results
- Skill metadata recovered from session JSONL remains visible after repeated history loads.
- Repeated loads reuse the unchanged session recovery parse instead of reparsing the same log for every turn-bearing RPC.
- In turns with multiple user-message items, recovered skill chips are attached to the latest user message in that turn.
- Skill chips remain readable in both light and dark themes.

#### Rollback/Cleanup
- Remove disposable test messages/threads if needed.

---

### Skills sync idempotent commits and nested shared skills handling

#### Feature/Change Name
Skills Sync skips unchanged manifest writes and does not fail parent commits when only nested `shared_skills` content is dirty.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 5173`)
2. GitHub Skills Sync is connected to a private skills sync repo
3. `/Users/igor/.codex/skills/shared_skills` exists as a nested Git repository
4. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, open `#/skills`.
2. Click `Startup Sync` when no installed skills manifest content has changed.
3. Confirm the sync completes without adding a new `Update synced skills manifest` commit to the GitHub repo.
4. Modify a file inside `/Users/igor/.codex/skills/shared_skills` without committing it inside that nested repository.
5. Click `Push` or `Startup Sync` again.
6. Confirm the sync does not show `Command failed (git commit -m Sync installed skills folder and manifest)` for the parent `/Users/igor/.codex/skills` repository.
7. Confirm the startup auto-push path skips when the only local status is dirty nested `shared_skills` content and local `HEAD` equals `origin/main`.
8. Switch to dark theme and repeat steps 1, 2, and 5.

#### Expected Results
- Unchanged `installed-skills.json` content is not written back to GitHub, so repeated empty-looking manifest commits are not created.
- A dirty nested `shared_skills` repository does not make the parent skills sync fail with `no changes added to commit`.
- Dirty nested `shared_skills` content alone does not keep triggering no-op startup push work.
- Skills Sync status, errors, and action buttons remain readable in light theme and dark theme.

#### Rollback/Cleanup
- Revert or commit the intentional test edit inside `/Users/igor/.codex/skills/shared_skills`.

---

### Feature: MCP elicitation requests and thread status labels

#### Prerequisites
- App is running from this repository with a recent Codex CLI/app-server build.
- At least one configured MCP server can trigger `mcpServer/elicitation/request` or `item/permissions/requestApproval`.

#### Steps
1. Start a thread and trigger an MCP flow that asks for user input or permission approval.
2. Confirm the thread row status chip in the sidebar appears in English (`Awaiting approval` or `Awaiting response`).
3. Open the pending request panel for `mcpServer/elicitation/request`.
4. Confirm only the black pending-request panel is shown for the request; no duplicate yellow in-conversation request card should appear.
5. If the elicitation is `form` mode, verify the requested fields are rendered as inputs/selects/checkboxes based on the schema.
6. For a required form field that has no schema default, click `Continue` without answering it and verify the request stays open with a validation error instead of submitting a fabricated answer.
7. For an optional boolean or enum field that has no schema default, verify the control starts unselected rather than prefilled with `False` or the first enum option.
8. If the elicitation is `url` mode, verify an authorization link is shown only when the URL uses `http` or `https`.
9. Submit `Continue`, then repeat and verify `Decline` and `Cancel` are also available.
10. Trigger an `item/permissions/requestApproval` request and verify `Accept` and `Accept for Session` are shown instead of the generic fallback buttons.

#### Expected Results
- MCP elicitation requests no longer fall back to `Return Empty Result` / `Reject Request`.
- Pending requests are shown only once, in the dedicated black pending-request panel.
- Form-mode elicitation requests submit structured `{ action, content }` responses.
- Required MCP form fields without defaults must be answered explicitly before the request can be accepted.
- Optional MCP boolean/enum fields without defaults remain unset until the user chooses a value.
- URL-mode elicitation requests show an authorization link and submit a valid `{ action }` response.
- Non-HTTP(S) authorization URLs are not rendered as clickable links.
- Permissions approval requests submit proper permission grants with turn/session scope.
- Sidebar pending-request chips are displayed in English.

#### Rollback/Cleanup
- Decline or cancel the MCP request after verification, and close any opened authorization URL if it was only used for testing.

### Feature: Skills list request scoped to active thread cwd

#### Prerequisites
- App is running from this repository.
- Browser DevTools Network tab is open.
- At least two threads exist with different `cwd` values.

#### Steps
1. Reload the app and wait for initial data load.
2. In Network tab, inspect `/codex-api/rpc` requests with method `skills/list`.
3. Verify request params contain `cwds` with only the currently selected thread cwd.
4. Switch to another thread with a different cwd.
5. Inspect the next `skills/list` request and verify `cwds` now contains only the new selected thread cwd.

#### Expected Results

### Feature: Skills sync pull live-reloads installed skills list

#### Prerequisites
- App running from this repository with Skills Hub available.
- GitHub skills sync configured and connected.
- At least one skill update available in the sync source (new or edited skill metadata).

#### Steps
1. Open the app and note the currently visible installed skills for the active thread cwd.
2. In Skills Hub, trigger `Pull` from GitHub sync.
3. Wait for the pull success toast.
4. Without restarting the app/server, navigate to thread composer skill picker and verify the installed skills list.
5. Switch to another thread and back to force a normal UI refresh path.

#### Expected Results
- Pull completes successfully.
- Installed skills list reflects pulled changes immediately without app/server restart.
- Thread switch keeps showing the updated skills list (no stale cache rollback).

#### Rollback/Cleanup
- If needed, run another sync pull/push to restore previous skill state in the sync repo.

### Feature: Public shared skills pull overwrites only shared skills

#### Prerequisites
- App running from this repository with Skills Hub available.
- GitHub skills sync is not configured/logged in.
- Public skills upstream is configured with `CODES_SKILLS_UPSTREAM_OWNER` and `CODES_SKILLS_UPSTREAM_REPO`.
- Local shared skills directory exists at `~/.codex/skills/shared_skills`.

#### Steps
1. Create a temporary local-only skill folder under `~/.codex/skills/shared_skills`, or edit a tracked shared skill file in that directory.
2. Note the parent `~/.codex/skills` status, including any unrelated local edits outside `shared_skills`.
3. Open `Skills Hub`.
4. Trigger `Pull` from the `Skills Sync (GitHub)` panel.
5. Wait for the pull success toast.
6. Inspect `~/.codex/skills/shared_skills` and compare it with the public upstream `main` branch.
7. Inspect `~/.codex/skills` and verify unrelated parent-level files were not reset or cleaned by the unauthenticated pull.
8. If `~/.codex/skills/shared_skills/.git` is a git file or worktree/submodule-style pointer, repeat the pull and verify the nested repo is not reinitialized.
9. Inspect the `/codex-api/skills-sync/pull` response and verify `data.synced` matches the number of direct shared skill folders with `SKILL.md`.
10. In light theme, verify the Skills Hub list reloads and does not show stale local-only skills.
11. Switch to dark theme and verify the same Skills Hub state remains readable and current.

#### Expected Results
- Public unauthenticated pull resets only the nested `shared_skills` repo to the public upstream `main` branch.
- Local uncommitted edits and local-only untracked skill folders inside `shared_skills` are removed by the pull.
- Parent-level `~/.codex/skills` files outside `shared_skills` are not reset or cleaned.
- Existing git-file/worktree/submodule-style shared skills repos are reused, not reinitialized.
- The pull response reports the shared skills count from `~/.codex/skills/shared_skills`, not the parent skills directory.
- The installed skills list reloads immediately after the pull in both light and dark theme.
- Private GitHub sync repos still preserve local edits through the bidirectional sync path.

#### Rollback/Cleanup
- Recreate any intentionally removed local-only shared skill if it should be kept.
- Use private sync `Push` only after confirming the public pull result should be mirrored elsewhere.

### Feature: Force Refresh Skills button in Skills Sync panel

#### Prerequisites
- App running from this repository with Skills Hub route accessible.
- At least one installed skill is available for the current thread cwd.

#### Steps
1. Open `Skills Hub`.
2. In `Skills Sync (GitHub)`, click `Force Refresh Skills`.
3. Verify button text changes to `Refreshing...` during the request and returns after completion.
4. Verify success toast appears.
5. Open the thread composer skills picker and confirm installed skills list is present and current.
6. Switch to another thread and back to ensure refreshed list remains consistent.

#### Expected Results
- `Force Refresh Skills` triggers a manual refresh without requiring pull/push.
- Loading state prevents duplicate clicks while refresh is in progress.
- Installed skills list updates immediately and remains updated across thread switches.

#### Rollback/Cleanup
- No cleanup required.

### Feature: SkillHub shows detailed skill load errors

#### Prerequisites
- App running from this repository.
- At least one invalid installed skill file exists (for example unresolved merge markers in `SKILL.md`).

#### Steps
1. Open `Skills Hub`.
2. Trigger `Force Refresh Skills`.
3. Locate the `Some skills failed to load` panel above the skills sections.
4. Verify each row shows:
   - the failing `SKILL.md` path
   - the exact parser error message from app server (for example invalid YAML line/column details).
5. Fix the invalid skill file and trigger `Force Refresh Skills` again.

#### Expected Results
- SkillHub surfaces app-server load failures with detailed path and message.
- Messages are specific enough to identify the broken file and parser failure reason.
- Error panel disappears after invalid skills are fixed and refreshed.

#### Rollback/Cleanup
- Restore any intentionally broken local skill files used for testing.

### Feature: Remote changes win when no local uncommitted skill edits exist

#### Prerequisites
- Skills sync configured with GitHub.
- Local skills repo working tree is clean (`git status --porcelain` empty under skills dir).
- Remote skills repo has newer commits touching existing skill files.

#### Steps
1. Confirm no local uncommitted changes in skills directory.
2. Trigger `Startup Sync` in Skills Hub.
3. After sync, inspect the skill file changed remotely.
4. Trigger `Force Refresh Skills` and confirm loaded skill content matches remote update.

#### Expected Results
- Sync pull/reconcile does not preserve stale local file content when local tree is clean.
- Remote updates are applied locally and remain after startup sync completes.

#### Rollback/Cleanup
- None.

### Codex.app-style Plugins Directory

#### Feature/Change Name
The `#/skills` route shows a full Skills & Apps directory with Plugins, Apps, Composio, and a Skills tab where an `MCPs(count)` section appears just before `Installed skills (count)`.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Codex CLI available in `PATH`
3. Optional: a Codex CLI version with `plugin/list`, `app/list`, and `mcpServerStatus/list` app-server APIs

#### Steps
1. Open `http://127.0.0.1:4173/#/skills`
2. Verify the page title is `Skills & Apps` and the tab row contains `Plugins`, `Apps`, `Composio`, and `Skills`
3. On `Plugins`, verify plugin cards load, the default sort is `Popular`, and `A-Z`, `Date`, and search controls work
4. Open a plugin card when one is available and verify description, capabilities, included apps/skills/MCPs, and install/uninstall or enable/disable actions are visible
5. For an installed plugin with bundled MCP servers, such as Cloudflare, verify each MCP row shows auth status (`Logged in`, `Bearer token`, `Login required`, `Auth unsupported`, or `Status unknown`)
6. If a bundled MCP server shows `Login required`, click `Authenticate` and verify the browser opens the returned MCP OAuth authorization URL
7. Switch to `Apps` and verify app cards load, or the unavailable/empty state appears without breaking the page
8. On `Apps`, verify the default sort control is `Popular`, app icons render, connected apps show `Manage`, and disconnected apps show `Login`
9. Click a disconnected app `Login` button and verify it opens the app login/manage URL
10. Click `Try it!` for a connected and enabled app and verify a new thread opens with an auto-submitted prompt asking what the app can do
11. While the app `Try it!` request is starting, click the button repeatedly and verify only one new thread is created
12. Open an installed/enabled plugin detail, click `Try it!`, and verify a new thread opens with an auto-submitted plugin test prompt
13. Open an installed/enabled skill detail, click `Try it!`, and verify a new thread opens with an auto-submitted skill test prompt and the skill attached
14. Install a plugin whose install response includes `appsNeedingAuth`, and verify the first required app login/manage URL opens automatically
15. Open a plugin whose detail lists a required app that is absent from the Apps catalog for the current account, such as Gmail on an account without Gmail app access, and verify the footer shows a disabled `ChatGPT Plus` action instead of `Install`
16. Switch Apps sorting to `A-Z` and verify apps reorder alphabetically; switch to `Date` and verify app-server catalog order is restored; switch back to `Popular` and verify casual-user relevant apps are prioritized and capped to 100 when no search is active
17. Search Apps and verify matching results are not capped to the Popular top 100 list
18. Switch to `Composio` and verify the workspace summary card shows the current installed Composio CLI login state, or a clear not-installed / not-authenticated message appears
19. If Composio CLI is not installed, click `Install Composio` and verify the app installs the CLI to `~/.composio/composio` using the official Composio installer
20. If Composio is available but not authenticated, click `Login` and verify the app opens a new tab, starts the installed `composio login --no-browser -y`, captures the returned auth URL, and navigates the new tab to that URL
21. Verify Composio connector cards show real connector details such as tool counts, trigger counts, auth mode, and connection state instead of only aggregate totals
22. In Composio search, type `instagram` and verify the Instagram connector appears first when it is returned by the connector source, ahead of description-only matches such as Meta Ads
23. Open a disconnected Composio connector and click `Connect` or `Reconnect`; verify the returned `connect.composio.dev` authorization URL opens
24. Open a connected Composio connector and verify connection rows show account identifiers and statuses such as `Active` or `Expired`
25. Click `Try it!` on a connected or no-auth Composio connector and verify a new thread opens with a Composio-specific prompt and the `composio-cli` skill attached
26. On Composio, verify that if more than one page exists, `Load more` appears and appends additional connectors while keeping prior results visible
27. In Composio search, verify the page state resets (the list returns to the first result page and stale pagination is cleared)
28. Switch to `Skills` and verify the view shows an `MCPs(count)` collapsible section immediately before the `Installed skills (count)` section
29. Expand `MCPs(count)` and verify server cards show auth status and tool/resource counts, or the unavailable/empty state appears without breaking the page
30. Click header `Refresh` while on `Skills` and verify MCP state reloads (it should perform MCP reload behavior on this tab instead of using a separate `Reload MCPs` button)
31. Verify no separate `Reload MCPs` button is shown in the header or inside the MCP section body
32. Verify the `MCPs(count)` section does not show its own search or sort controls
33. Verify MCP cards use the same visual card/grid layout pattern as Installed skills cards (avatar circle, title row, badge, secondary text)
34. Verify the `Installed skills (count)` section below MCPs still supports the existing Skills Hub behavior
35. Verify both light and dark themes render Composio cards and status/detail actions with readable contrast
36. In dark mode, verify MCP cards use the same dark card surface styling as Installed skills cards (not a light/white card)

#### Expected Results
- The directory tabs render without a full-page error
- Plugin/app/Composio API failures are isolated to their tab
- Existing Skills Hub behavior remains available under the `Skills` tab, with MCPs presented just before Installed skills
- App and plugin enable/disable actions update their local card state after a successful config write
- Plugin detail shows bundled MCP login state and can launch MCP OAuth for `notLoggedIn` servers
- Disconnected apps are labeled `Login`; connected apps are labeled `Manage`
- The Composio tab uses the installed Composio CLI, preferring `CODES_COMPOSIO_COMMAND` when set and otherwise `~/.composio/composio` or `composio` on `PATH`
- The Composio install action uses the official installer and produces a working `~/.composio/composio` binary
- The Composio login action opens a new tab from the click, starts the installed `composio login --no-browser -y`, then navigates that tab to the returned auth URL
- Composio connector cards and detail views show concrete connector details, connection rows, and useful tool samples
- Composio search prioritizes exact slug/name matches above connectors that only mention the query in their description
- Unit coverage verifies that Composio exact query matches outrank description-only matches and that gateway connector search sends `query`, `cursor`, and `limit` params expected by the server
- Connected or no-auth Composio connectors expose `Try it!`, creating a new chat with the `composio-cli` skill attached
- Composio pagination supports page-by-page loading with a clear `Load more` path and cursor-based page continuation
- Plugin install opens the first required app login/manage page before falling back to bundled MCP OAuth login
- Plugin install is blocked with `ChatGPT Plus` when the plugin requires an app that is absent from the Apps catalog for the current account
- Connected and enabled apps, plus installed/enabled plugins/skills, expose `Try it!`, creating a new chat with an auto-submitted test prompt
- Repeated `Try it!` clicks during startup are ignored until the first request resolves, so duplicate threads are not created
- Plugins, Apps, and the Skills-tab MCP section default to local popularity-style ordering because app-server does not expose numeric popularity fields
- The Skills tab presents MCPs in the same section style as Installed skills, just above Installed skills, instead of using a separate top-level MCP tab
- `Date` uses the app-server/catalog order as the available freshness proxy because app/plugin/MCP APIs do not expose created or published timestamps
- Popular views show only the top 100 when no search is active; search results can show all matches

#### Rollback/Cleanup
- Re-enable any app or plugin disabled during testing
- Uninstall any plugin installed only for this test

---

### Feature: Nested skill bundles are grouped in discovery

#### Feature/Change Name
Composer skill discovery collapses nested `skills/<subskill>/SKILL.md` entries under their top-level bundle skill when the bundle root skill is also present, including curated plugin skill packs such as `cloudflare:*`.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Open a thread whose cwd can access installed skills
3. At least one installed skill bundle or curated plugin pack contains a top-level/root `SKILL.md` plus additional subskills

#### Steps
1. Open the thread composer skill picker
2. Search for a grouped bundle or plugin root such as `cloudflare`
3. Confirm the grouped root appears once in the picker
4. Search for one nested subskill or prefixed plugin skill name such as `agents-sdk` or `cloudflare:workers-best-practices`
5. Refresh the page or switch threads and reopen the skill picker

#### Expected Results
- The picker shows a single top-level entry for the bundled skill or plugin root
- Nested subskill folder names and plugin-prefixed variants do not appear as separate skill discovery entries when the parent/root entry exists
- Grouped plugin roots render a clean label such as `cloudflare` instead of `cloudflare:cloudflare`
- The grouped result remains stable after refresh or thread switching

#### Rollback/Cleanup
- None

---

### First-launch home card for Plugins and Apps

#### Feature/Change Name
The home route shows a dismissible first-launch card that introduces Plugins and Apps and opens the existing Skills & Apps directory on the Plugins tab.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Codex global-state preference `first-launch-plugins-card-dismissed` removed or set to `false` before the first check
3. App loaded on the home/new-thread route

#### Steps
1. Open the app on the home route with the local storage key removed
2. Verify the home screen shows a card with the heading `Plugins are here`
3. Verify the body copy mentions app examples such as Gmail and Calendar
4. Click `Explore Plugins & Apps`
5. Verify the app navigates to the `#/skills` route and the `Plugins` tab is active
6. Return to the home route and verify the card does not reappear
7. Remove the local storage key again, reload the home route, and click `Dismiss`
8. Reload the home route once more

#### Expected Results
- The card appears only when the server-backed dismissal preference is unset or `false`
- The primary CTA hides the card and opens the Skills & Apps directory
- The directory opens with `Plugins` selected by default
- Dismissing the card hides it immediately and keeps it hidden after reload

#### Rollback/Cleanup
- Remove or set `first-launch-plugins-card-dismissed` to `false` in Codex global state if you want to see the card again

---

### Composer prompts inside Skills dropdown

#### Feature/Change Name
The composer control row uses one `Skills` dropdown for both skills and saved prompts. The `+` action creates a prompt, prompt rows can be inserted or removed from the same menu, and there is no separate `Prompt` control.

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`
2. Open any existing thread so the composer controls are enabled
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the composer controls and confirm `Skills` appears and no separate `Prompt` control is present
2. Open `Skills` and verify the popup matches the wider card-like layout with large stacked label/description rows
3. Confirm skill rows have compact source markers, such as `R` for repo, `U` for user, `S` for system, or `P` for plugin
4. Click the `+` action in the `Skills` dropdown, enter a unique prompt name such as `ui-test-prompt`, and enter sample content such as `Prompt dropdown smoke test`
5. Reopen `Skills` and confirm the new prompt appears with a `Prompt` marker and an inline `×` remove action
6. Click the prompt row and confirm the prompt text is inserted into the composer draft without toggling a skill
7. Reopen `Skills`, click the `×` button for `ui-test-prompt`, and confirm the removal dialog
8. Confirm the prompt disappears from the dropdown while skill rows remain available
9. Type `/` into the composer and verify no slash skill picker appears
10. Switch to dark theme and repeat the visibility check for the combined `Skills` dropdown contents

#### Expected Results
- The composer shows one `Skills` dropdown for skills and prompts; no standalone `Prompt` dropdown is rendered
- The combined `Skills` popup uses the wider rounded layout with vertically stacked label/description rows
- Skill rows show readable source markers that distinguish repo, user, system, and plugin-provided skills
- Prompt rows show a readable `Prompt` marker and are the only rows with an inline remove action
- Typing `/` in the composer does not open a skill picker
- The `+` action creates a markdown file in the Codex prompt store and adds it to the `Skills` dropdown immediately
- Selecting a saved prompt appends its content into the draft without sending the message
- Clicking `×` removes only the targeted prompt and updates the dropdown immediately
- Light theme and dark theme both keep the new control, menu, and remove action readable and usable

#### Rollback/Cleanup
- Delete any temporary verification prompt created during the test

---
