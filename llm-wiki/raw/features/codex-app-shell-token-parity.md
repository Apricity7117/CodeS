# Codex.app 外壳 Token 对齐来源记录

日期：2026-05-19

## 背景

- 本项目继续保留现有 Vue 前端和 Codex CLI/app-server bridge。
- 已从 `/Applications/Codex.app/Contents/Resources/app.asar` 检查本机安装的 Codex 桌面 app。
- Codex.app 自带可执行文件 `/Applications/Codex.app/Contents/Resources/codex`，其版本输出为 `codex-cli 0.131.0-alpha.9`。
- 本项目通过 `src/commandResolution.ts` 解析外部 Codex CLI，并在 `src/server/codexAppServerBridge.ts` 中启动 `codex app-server`。

## 桌面端参照发现

- Codex.app 外壳参照通过 `http://127.0.0.1:3434` 的 CDP 采集。
- 深色主题参照 token 样本：
  - `--color-background-surface`: `#1e1e1e`
  - `--color-background-surface-under`: `#191919`
  - `--color-token-border-heavy`: `rgba(212, 212, 212, 0.192)`
  - `--height-toolbar`: `46px`
  - 左侧面板宽度：`300px`
  - 主 surface 圆角：`12.5px 0 0 12.5px`
  - 主 surface ring/shadow：`0 0 0 0.5px` 加轻微 `0 2px 4px -1px` 阴影

## 已实现映射

- `src/style.css` 增加外壳级 Codex token，用于 surface-under、边框强度、工具栏高度和桌面圆角。
- `src/components/layout/DesktopLayout.vue` 为 `.desktop-main` 增加 Codex.app 风格的左侧圆角和 ring/shadow。
- `src/components/layout/DesktopLayout.vue` 的默认侧栏宽度为 `300px`，最小宽度为 `240px`，最大宽度为 `520px`。
- `loadSidebarWidth()` 现在会把缺失的 localStorage 值视为默认值，不再把 `null` 转成 `0` 后夹到最小宽度。
- `src/components/content/ContentHeader.vue` 使用共享的 `46px` 工具栏 token 和 `13px` 标题文字 token。

## 验证产物

- Codex.app 参照截图：`output/playwright/desktop-parity-shell-codex-reference.png`
- Web 改前截图：
  - `output/playwright/desktop-parity-shell-web-before-dark.png`
  - `output/playwright/desktop-parity-shell-web-before-light.png`
- Web 改后截图：
  - `output/playwright/desktop-parity-shell-web-after-dark.png`
  - `output/playwright/desktop-parity-shell-web-after-light.png`
