# Codex.app Composer 对齐来源记录

日期：2026-05-19

## 背景

- 本项目继续保留 Vue `ThreadComposer.vue` 和现有 Codex CLI/app-server bridge。
- 用户指出输入框布局与 Codex.app 不一致，要求模型选择放到右下角，并在语音输入左侧显示上下文用量。
- 本次只映射桌面端 composer 的布局和状态展示，不移植 Codex.app React/Electron bundle。

## 桌面端参照发现

- Codex.app composer 参照通过 `http://127.0.0.1:3434` 的 CDP 采集。
- 桌面端 composer 主输入 shell 约 `96px` 高，圆角约 `25px`，输入区为一行起步的 contenteditable 区域。
- 底部 composer footer 使用三列布局：左侧附件和模式，中间弹性占位，右侧 provider/model/推理和发送按钮。
- 右侧模型区域在发送按钮左侧，使用透明圆角按钮和弱前景色。

## 已实现映射

- `src/components/content/ThreadComposer.vue` 的 textarea 增加 `rows="1"`，输入区从一行起步。
- 模型 `ComposerDropdown` 从左侧控制组移动到 `.thread-composer-actions`，视觉上位于右下角、语音按钮左侧。
- 技能和 Thinking 仍保留在左侧控制组，符合本项目已有功能边界。
- 已有 `threadTokenUsage` 派生视图被接入模板：有上下文数据时显示紧凑 pill、百分比/token 摘要和进度条；无数据时隐藏。
- 上下文用量 pill 放在模型选择和语音按钮之间，tooltip 提供上下文窗口、当前上下文、上一轮和会话总量信息。
- 窄屏下右侧操作组会换到下一行并右对齐，避免模型、上下文用量、语音和发送按钮溢出 shell。

## 验证产物

- Codex.app composer 参照截图：`output/playwright/desktop-parity-composer-codex-reference.png`
- Web 改前截图：`output/playwright/desktop-parity-composer-web-before.png`
- Web 改后截图：
  - `output/playwright/desktop-parity-composer-web-after-light.png`
  - `output/playwright/desktop-parity-composer-web-after-dark.png`
  - `output/playwright/desktop-parity-composer-web-after-context-light.png`
  - `output/playwright/desktop-parity-composer-web-after-context-dark.png`
  - `output/playwright/desktop-parity-composer-web-after-mobile-context.png`
