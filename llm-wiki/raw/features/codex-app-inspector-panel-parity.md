# Codex.app 右侧常驻窗口对齐来源记录

日期：2026-05-19

## 背景

- 用户要求将背景信息窗口改为 Codex.app 风格圆形指示器，并新增右侧常驻窗口。
- 用户要求把原右上角分支按钮移动到常驻窗口内，右上角改为常驻窗口显示/隐藏开关。
- 本次继续保持本项目 Vue UI 和现有 Codex CLI/app-server bridge，不移植 Codex.app Electron/React 逻辑。

## 桌面端参照发现

- Codex.app 参照通过临时 CDP 端口 `3434` 采集，目标为 `app://-/index.html`，标题为 `Codex`。
- 参照中的 pinned summary 面板位于右侧，约 `300px` 宽，圆角约 `25px`，使用分区标题和行式内容。
- 面板常见分区包括进度和环境信息。当前 Vue 实现按用户可见信息收敛为环境、可选进度、来源，不显示后台任务占位。
- Header 右侧存在图标按钮用于切换 pinned summary 显示状态。

## 已实现映射

- `src/App.vue` 新增右侧 `content-inspector-panel`，常态包含环境和来源两个分区。
- 存在 `turn/plan/updated` 生成的 `message.plan.steps` 时，进度分区插入环境和来源之间；无 plan 步骤时不渲染进度分区。
- 进度分区逐步显示 completed/inProgress/pending 状态，全部 completed 后自动折叠，用户仍可点击标题右侧小图标手动展开。
- 原 header 中的 `HeaderGitBranchDropdown` 被移动到常驻窗口环境分区内，分支切换、commit 加载、review toggle 仍复用原组件和原事件。
- Header 右侧新增 `content-header-inspector-toggle`，使用现有 Tabler sidebar 图标，显示/隐藏状态写入 `codex-web-local.inspector-panel-open.v1`。
- `src/components/content/ThreadComposer.vue` 将上下文用量从文字 pill 改为圆形指示器，圆环显示已用百分比，hover/focus 显示背景信息、当前上下文、上一轮和会话累计。
- `src/style.css` 放置常驻窗口和上下文浮层的关键深色主题覆盖，避免深色页面出现浅色 surface。

## 2026-06-09 更新

- 发送反馈诊断入口已移除；reconnecting/live error 和其他可见错误不再显示 `Send feedback`。
- 独立右上 Plan dock 已移除，Plan 内容保留在消息流中，右侧常驻窗口只承载步骤进度摘要。
- Composer 展开/折叠按钮沿用 Codex Desktop 图标语义：展开状态显示退出全屏图标，折叠状态显示进入全屏图标。

## 验证产物

- Codex.app 参照截图：`output/playwright/desktop-parity-inspector-codex-reference.png`
- Web 改前截图：`output/playwright/desktop-parity-inspector-web-before.png`
- Web 改后截图：
  - `output/playwright/desktop-parity-inspector-web-after-light.png`
  - `output/playwright/desktop-parity-inspector-web-after-dark.png`
  - `output/playwright/desktop-parity-inspector-web-mobile.png`
  - `output/playwright/desktop-parity-context-ring-hover.png`
  - `output/playwright/desktop-parity-context-ring-hover-dark.png`
