# Codex.app 右侧常驻窗口对齐

来源：[codex-app-inspector-panel-parity.md](../../raw/features/codex-app-inspector-panel-parity.md)

## 边界

右侧常驻窗口只复刻 Codex.app 的可见组织方式和交互位置。分支切换、commit 列表、review 状态、token usage 和终端状态仍来自本项目现有 Vue 状态与 app-server bridge。

## 面板结构

`App.vue` 的主内容区在 `ContentHeader` 下方新增 `content-workspace`：

- 左侧继续承载原 `content-body`。
- 右侧在打开时渲染 `content-inspector-panel`。
- 面板常态分区为环境和来源；当最新消息存在 `message.plan.steps` 时，在环境和来源之间插入进度分区。
- 进度分区只读取 `turn/plan/updated` 派生的真实 plan 步骤，不用线程运行中、待请求或终端状态合成假进度。
- 进度步骤逐步显示完成勾选、进行中圆点和未开始空圆；全部完成后自动折叠，标题右侧图标可手动展开。

## Git 入口

原右上角 `HeaderGitBranchDropdown` 被迁移到 Git 分区。迁移后仍复用原组件和事件：

- `checkout-branch`
- `reset-branch-to-commit`
- `load-commits`
- `toggle-review`

因此 UI 位置变化不会重写 Git 行为，也不会复制分支切换逻辑。

## Plan 与反馈入口

Plan 内容保留在消息流中，不再使用独立右上 Plan dock 隐藏消息流中的 live plan。发送反馈诊断入口已移除，错误状态只展示错误文本和原有重试/操作控件。

## 开关与持久化

Header 右侧新增图标按钮用于显示/隐藏常驻窗口。状态保存在 `codex-web-local.inspector-panel-open.v1`。桌面端默认打开，窄屏首次加载默认关闭；用户手动切换后按本地偏好恢复。

## 背景信息圆环

Composer 的 `threadTokenUsage` 显示改为圆形指示器：

- 圆环按已用上下文百分比填充。
- 圆心显示短百分比数字。
- Hover/focus 浮层展示背景信息窗口、已用/总 token、上一轮和会话累计。
- 颜色仍按剩余上下文 healthy/warning/danger 派生。

## 主题与响应式

关键深色覆盖放在 `src/style.css`，确保常驻窗口、分区线、Git 入口和上下文浮层不会在深色页面保持浅色 surface。窄屏下常驻窗口以右侧浮层方式出现，避免挤压 composer。

## 验证

参照、改前、改后、深色、移动端和上下文圆环 hover 截图均保存在 `output/playwright/desktop-parity-inspector-*.png` 与 `output/playwright/desktop-parity-context-ring-hover*.png`。
