# AI 维护入口地图

这份文档用于降低小功能修改的定位成本。开始改代码前，先按目标区域读取对应入口，避免从巨型文件重新摸索。

## 快速判断

- 应用级纯配置、偏好读写、导出文本、账号展示文本、DirectoryHub try 文案：先看 `src/app/`，再看 `src/App.vue` 的薄包装调用。
- 聊天消息渲染、Markdown、代码高亮：先看 `src/components/content/ThreadConversation.vue`，再看 `llm-wiki/wiki/concepts/realtime-chat-rendering.md`。
- Plan 卡片解析、复制文本、步骤状态：先看 `src/components/content/threadPlanUtils.ts` 和对应单测。
- 文件链接解析、路径归一化、图片代理 URL：先看 `src/components/content/threadFileLinks.ts` 和对应单测。
- 文件变更聚合、diff viewer 行解析、文件变更复制文本：先看 `src/components/content/threadFileChanges.ts` 和对应单测。
- 消息复制文本、助手回复按 turn 合并、fork anchor 计算：先看 `src/components/content/threadMessageActions.ts` 和对应单测。
- 线程列表、项目分组、置顶、侧栏菜单：先看 `src/components/sidebar/SidebarThreadTree.vue` 和 `src/components/sidebar/pinnedThreadUtils.ts`。
- 全局线程状态、实时通知、消息合并、队列、workspace roots：先看 `src/composables/useDesktopState.ts`。
- 前端调用后端 API：先看 `src/api/codexGateway.ts` 和 `src/api/codexRpcClient.ts`。
- Codex app-server bridge、自动化、inline media、session recovery：先看 `src/server/codexAppServerBridge.ts`。
- 本地图片、文件、目录浏览、文本编辑：先看 `src/server/localResourceMiddleware.ts` 和 `src/server/localBrowseUi.ts`。不要在 `vite.config.ts` 或 `src/server/httpServer.ts` 里重复写 `/codex-local-*` 逻辑。
- 集成终端：前端看 `src/components/content/ThreadTerminalPanel.vue`，后端看 `src/server/terminalManager.ts`，背景知识看 `llm-wiki/wiki/concepts/integrated-terminal.md`。
- Skills / Apps / Composio 页面：先看 `src/components/content/DirectoryHub.vue` 和 `llm-wiki/wiki/concepts/directory-hub-composio-skills.md`。

## 目录职责

- `src/app/`：承接顶层应用的纯逻辑和稳定配置，例如 localStorage 偏好、设置帮助文案、账号显示文本、会话 Markdown 导出、终端快捷命令和 DirectoryHub try 文案。这里不放 Vue 响应式状态。
- `src/components/`：只负责 UI 结构、交互事件和局部展示工具。组件之间通过 props/emits 连接，避免跨组件直接访问全局状态。
- `src/composables/`：放响应式状态和跨组件业务流程，例如线程列表、消息、实时事件、队列、workspace roots。
- `src/api/`：前端到后端的调用边界，统一封装 HTTP/RPC 请求和响应归一化。
- `src/server/`：Codex app-server bridge、本地资源服务、终端、自动化等 Node 侧能力。
- `src/types/`：跨层共享的 TypeScript 类型；只被单个模块使用的类型优先留在该模块附近。

## 复现范围

- 已迁移源项目的源码、配置、脚本、公开资源和文档，使当前仓库可按 Vue/TypeScript/Vite 项目独立安装、构建和测试。
- 未迁移本地状态和生成产物：`.git/`、`.trellis/`、`.claude/`、`.codex/`、`.gemini/`、`.agent/`、`.agents/`、`node_modules/`、`dist/`、`dist-cli/`、`release/`、`.env`、`.DS_Store`、源项目 `AGENTS.md`。

## 修改原则

- 优先抽纯函数、共享中间件、小 composable；不要继续把新逻辑塞进 `App.vue`、`ThreadConversation.vue`、`useDesktopState.ts`、`codexAppServerBridge.ts`。
- `App.vue` 仍是编排入口；新增可测试的纯逻辑时优先放入 `src/app/` 或已有工具模块，再由 `App.vue` 引用。
- 保持现有 public interface：组件 props/emits、`useDesktopState()` 返回结构、`codexGateway.ts` 导出、HTTP 路径和 RPC method 不应为重构而改变。
- 改跨层功能时先画清数据流：server bridge -> gateway -> state/composable -> component。
- 视觉修改必须检查 light/dark；聊天渲染和实时流修改必须参考 realtime rendering wiki，避免破坏缓存和 `v-memo`。

## 常用验证

- 类型检查：`pnpm exec vue-tsc --noEmit`
- 全量单测：`pnpm test:unit`
- 本地资源中间件：`pnpm exec vitest run src/server/localResourceMiddleware.test.ts`
- 状态合并：`pnpm exec vitest run src/composables/useDesktopState.test.ts`
- app-server bridge：`pnpm exec vitest run src/server/codexAppServerBridge.*.test.ts`
- 聊天渲染工具：`pnpm exec vitest run src/components/content/threadWorkedGrouping.test.ts src/components/content/inspectorProgress.test.ts`
