# Codex.app Composer 对齐

来源：[codex-app-composer-parity.md](../../raw/features/codex-app-composer-parity.md)、[codex-app-inspector-panel-parity.md](../../raw/features/codex-app-inspector-panel-parity.md)

## 边界

Composer 对齐以 Codex.app 的可见布局为参照，但实现仍使用本项目 Vue 组件、现有状态和 app-server bridge。不得直接运行或移植桌面端 React/Electron composer bundle。

## 布局原则

`ThreadComposer.vue` 的底部控制区分为左右两组：

- 左侧保留附件、技能和 Thinking。
- 右侧承载模型选择、上下文用量、语音输入和发送/停止按钮。

这与 Codex.app 的 composer footer 接近：左侧是输入辅助控制，右侧是运行配置和提交动作。模型选择不应再出现在左侧控制组。

## 上下文用量

`threadTokenUsage` 已经由桌面状态层传入 composer。Composer 只负责把已有数据渲染为紧凑圆形指示器：

- 有数据时显示已用百分比圆环，圆环位于模型选择和语音输入之间。
- 无数据时隐藏，避免在新线程或未收到 usage 事件时显示误导性的占位数据。
- Hover/focus 浮层展示背景信息窗口、当前上下文、上一轮和会话总量。
- 状态色按剩余上下文分为 healthy、warning、danger。

## 响应式

窄屏下右侧操作组可以换到下一行并右对齐。模型、上下文圆环、语音和发送按钮必须仍在 composer shell 内，不得遮挡左侧控制或输入文本。

## 验证

使用 Codex.app CDP 截图作为参照，并在 Web 浅色、深色、上下文用量注入状态和 `375px` 窄屏下验证。当前产物位于 `output/playwright/desktop-parity-composer-*.png`。
