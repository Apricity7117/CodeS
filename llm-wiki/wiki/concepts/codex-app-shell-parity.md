# Codex.app 外壳对齐

来源：[codex-app-shell-token-parity.md](../../raw/features/codex-app-shell-token-parity.md)

## 边界

Codex.app 是视觉和行为参照，但本项目不应直接运行或移植桌面端 React/Electron bundle。Web UI 保留现有 Vue 组件和 Codex CLI/app-server bridge，只把桌面端 token 与交互细节映射到本地组件。

Codex.app 在 app bundle 内自带 `codex` 可执行文件。本项目则解析外部 CLI 命令并启动 `codex app-server`，因此对齐工作默认不改变 bridge 归属，除非另一个任务明确要求调整运行时行为。

## 外壳 Token 基线

第一批对齐覆盖桌面外壳层：

- 深色 surface-under：`#191919`
- 深色主 surface：`#1e1e1e`
- 工具栏高度：`46px`
- 默认侧栏宽度：`300px`
- 主 surface 左侧圆角：`12.5px`
- 主 surface ring：使用 heavy border token 的 `0.5px` ring

这些值以项目自有的 `--codex-*` 变量放在 `src/style.css`，而不是直接导入桌面端 CSS。

## 实现备注

`DesktopLayout.vue` 负责 app 外壳框架。它应保留 resize handle 功能，同时让分隔线默认保持低干扰。`.desktop-main` 对应 Codex.app 的 `main-surface`，因此由它承载左侧圆角、ring 和阴影。

`ContentHeader.vue` 使用 `--codex-toolbar-height`，让顶部 chrome 与桌面参照对齐。

未保存侧栏宽度时，`loadSidebarWidth()` 必须返回配置的默认值。避免直接使用 `Number(null)`，因为它会变成 `0` 并被夹到最小宽度。

## 验证

使用 Codex.app CDP 截图作为参照，并在浅色/深色主题下对比 Web 改前与改后。当前产物位于 `output/playwright/desktop-parity-shell-*.png`。
