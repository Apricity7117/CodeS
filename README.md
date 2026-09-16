# CodeS

[![npm version](https://img.shields.io/npm/v/%40voeid%2Fcodes?logo=npm)](https://www.npmjs.com/package/@voeid/codes)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**CodeS** 是一个轻量级 Web UI，让你从任意浏览器远程访问本地的 [OpenAI Codex](https://github.com/openai/codex) 实例。它以 `codex app-server` 为后端，复刻了 Codex Desktop 的核心体验，并扩展了若干额外特性。

---

## 特性

- **全功能对话界面** — 流式输出、实时推理文本、消息队列、语音输入、多模态附件
- **线程管理** — 创建/归档/删除/Fork/回滚，支持收藏与导出
- **模型灵活选择** — 多模型目录、思考强度（none → ultra）、协作/速度模式，每线程独立配置；**无需修改 `~/.codex/config.toml`，在 UI 中即可切换模型和 Provider**
- **实时推送** — WebSocket 优先，自动降级 SSE
- **服务端请求审批** — 弹窗展示 Codex 发起的命令/文件/工具调用，支持批准/拒绝
- **Skills Hub** — 浏览、安装并在输入框中注入社区 Skills
- **Git Review** — 工作区变更查看，支持 stage / unstage / revert
- **本地文件集成** — 内联图片预览、本地文件浏览、右侧检查器面板
- **终端集成** — 在项目目录打开系统终端，自动发现 npm scripts / Makefile 快捷命令
- **Telegram Bot 桥接** — 通过 Telegram 收发 Codex 对话
- **多账号管理** — 账号切换、速率限制查看
- **密码保护** — 默认自动生成随机密码（存于 `~/.codex/codes-password`），可选关闭
- **PWA 支持** — 支持安装为桌面应用，移动端适配
- **深色/浅色主题** — 跟随系统或手动切换

---

## 模型与 Provider 配置

CodeS 通过本地代理（Provider Proxy）将 Codex 的请求转发到第三方 Provider，配置通过启动参数实时注入，**不会修改 `~/.codex/config.toml`**。Provider 必须支持 **Responses API**——这是硬性要求。可以使用 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 等**协议转换代理**将其他 API 转为 Responses API。

### 模型目录（codes-model-catalog.json）

可在 `~/.codex/codes-model-catalog.json` 中添加任意模型（含非 OpenAI 官方模型），CodeS 会在 UI 中合并自动发现的模型与此处配置的模型一起展示：

```json
{
  "defaultModel": "gpt-5.6-sol",
  "defaultReasoningEffort": "high",
  "models": [
    {
      "id": "deepseek-v4-pro",
      "label": "DeepSeek V4 Pro",
      "reasoningEfforts": ["xhigh", "max"],
      "defaultReasoningEffort": "max"
    },
    {
      "id": "deepseek-v4-flash",
      "label": "DeepSeek V4 Flash",
      "reasoningEfforts": ["high", "xhigh", "max"],
      "defaultReasoningEffort": "max"
    },
    {
      "id": "claude-opus-5",
      "label": "Claude Opus 5",
      "reasoningEfforts": ["xhigh", "max"],
      "defaultReasoningEffort": "max"
    },
    {
      "id": "claude-sonnet-5",
      "label": "Claude Sonnet 5",
      "reasoningEfforts": ["xhigh", "max"],
      "defaultReasoningEffort": "max"
    },
    {
      "id": "grok-4.5",
      "label": "Grok 4.5",
      "reasoningEfforts": ["xhigh", "max"],
      "defaultReasoningEffort": "max"
    },
    {
      "id": "glm-5.3-flash",
      "label": "GLM 5.3 Flash",
      "reasoningEfforts": ["xhigh", "max"],
      "defaultReasoningEffort": "max"
    }
  ],
  "order": [
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "deepseek-v4-flash",
    "claude-opus-5",
    "glm-5.3-flash",
    "deepseek-v4-pro"
  ]
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `defaultModel` | 新线程默认使用的模型 id |
| `defaultReasoningEffort` | 全局默认思考强度 |
| `models[].id` | Provider 识别的模型 id |
| `models[].label` | UI 中显示的名称（可选，默认同 id）|
| `models[].reasoningEfforts` | 该模型支持的思考强度列表（可选）|
| `models[].defaultReasoningEffort` | 该模型的默认思考强度（可选）|
| `models[].hidden` | 设为 `true` 可隐藏自动发现的模型（可选）|
| `order` | 控制 UI 中模型的显示顺序（可选）|

文件保存后 CodeS 会热重载，无需重启。

---

## 前置依赖

- **Node.js** >= 18
- **OpenAI Codex CLI**（`@openai/codex`）— 首次运行时若未检测到，会自动安装

---

## 安装与运行

### 方式一：通过 npm 安装（推荐）

无需克隆仓库或从源码构建，直接安装 npm 包：

```bash
npm install -g @voeid/codes
codes
```

如果不想全局安装，也可以临时运行：

```bash
npx --package=@voeid/codes codes
```

> 由于本项目使用 scoped npm 包名，不能使用 `npx codes`；该命令会解析到 npm 上其他同名包。

安装成功后直接运行 `codes`，启动完成后输出：

```
CodeS is running!
  Version:  x.x.x
  Local:    http://localhost:5900
  Network:  http://192.168.x.x:5900
  Generated password file: /Users/xxx/.codex/codes-password
```

打开浏览器访问对应地址，输入密码文件中的密码即可登录。

> **首次运行**：若系统 PATH 中未检测到 `codex` CLI，会自动执行 `npm install -g @openai/codex` 并引导登录。

### 方式二：从源码构建

适用于开发、调试或使用尚未发布的代码：

```bash
git clone https://github.com/YOUR_USERNAME/CodeS.git
cd CodeS
pnpm install
pnpm run build
node dist-cli/index.js
```

### 方式三：从本地 tgz 包安装

适用于发布前在本地验证安装包：

```bash
pnpm install
pnpm run build
pnpm pack --pack-destination ./release/
npm install -g ./release/voeid-codes-*.tgz
codes
```

---

## 命令行选项

```
codes [项目目录] [选项]

选项：
  --port <port>                     监听端口（默认 5900，占用时自动 +1）
  --password <password>             指定访问密码
  --no-password                     禁用密码保护（仅限本机可信环境）
  --no-open                         启动后不自动打开浏览器
  --no-login                        跳过 Codex 登录状态检查
  --sandbox-mode <mode>             沙盒模式（read-only / workspace-write / danger-full-access）
  --approval-policy <policy>        审批策略（untrusted / on-failure / on-request / never）
  --open-project <path>             将项目写入 Codex 全局列表后退出（不启动服务）
```

**示例：**

```bash
# 指定端口并关闭密码保护
codes --port 5999 --no-password

# 以受限沙盒模式启动，需手动审批所有操作
codes --sandbox-mode workspace-write --approval-policy on-request

# 启动时直接打开某个项目
codes /path/to/project
```

---

## 子命令

```bash
# 安装/检查 Codex CLI 并执行 codex login
codes login
```

---

## 环境变量

可通过 `.env` / `.env.local` 文件或系统环境变量配置：

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `CODES_HOST` | Web 服务绑定地址 | `0.0.0.0` |
| `CODES_SANDBOX_MODE` | 沙盒模式 | `danger-full-access` |
| `CODES_APPROVAL_POLICY` | 审批策略 | `never` |
| `CODES_CODEX_COMMAND` | Codex CLI 命令路径 | 自动探测 |
| `CODES_RG_COMMAND` | ripgrep 路径 | 自动探测 |
| `CODES_TERMINAL_COMMAND` | 打开终端命令模板（支持 `{dir}` 占位符） | 按平台自动选 |
| `CODEX_HOME` | Codex 状态目录（auth.json、密码文件等） | `~/.codex` |

---

## 从源码开发

```bash
# 安装依赖
pnpm install

# 启动开发服务（含 Vite HMR + bridge 中间件）
pnpm run dev

# 类型检查
pnpm run typecheck

# 全量构建
pnpm run build

# 单元测试
pnpm run test:unit
```

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Vue 3（Composition API）+ Vue Router 4 |
| 样式 | Tailwind CSS 4 |
| 构建 | Vite 6 / tsup 8 |
| 服务器 | Express 5 + ws |
| Markdown | markdown-it + highlight.js + KaTeX |
| CLI | Commander 13 |

---

## 来源说明

本项目基于 [codex-mobile](https://github.com/friuns2/codex-mobile)（作者：Pavel Voronin、Igor Levochkin，MIT License）修改而来，已在原有基础上进行了大量重构与功能扩展。

---

## License

MIT © Pavel Voronin, Igor Levochkin
