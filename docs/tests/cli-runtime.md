# CLI 与运行时

本分卷覆盖本地或局域网浏览器使用 CodeS 的核心启动链路。公网转发、内置命令行面板和第三方模型代理不属于当前范围。

## 本地 CLI 启动

### 步骤

1. 运行 `pnpm run build:cli`。
2. 启动：`node dist-cli/index.js --no-open --no-login --port 5998 --password TEST_SECRET_SHOULD_NOT_PRINT`。
3. 打开 `http://127.0.0.1:5998`。
4. 停止进程。

### 期望

- 启动日志包含 localhost URL 和 LAN URL。
- 日志不打印明文密码。
- `--help` 中不存在已删除的联网参数。

## 局域网访问与密码

### 步骤

1. 在主机启动：`node dist-cli/index.js --no-open --port 5900`。
2. 从同一局域网设备访问启动日志里的 LAN URL。
3. 输入启动日志提供的密码。

### 期望

- 局域网设备可打开 UI。
- 未认证请求会进入登录页或密码流程。
- 本机访问不需要任何公网转发进程。

## Dev 脚本

### 步骤

1. 运行 `pnpm dev`。
2. 打开 Vite URL。
3. 检查默认 sandbox/approval 环境变量。

### 期望

- 前端可正常加载。
- 默认运行时配置与 `src/config/env.ts` 的兼容环境变量一致。
- Vite 不允许已删除公网转发功能的专用 host。

## 语音转写后端

### 步骤

1. 运行 `pnpm run build`。
2. 执行 `node scripts/test-whisper-backend.mjs`。

### 期望

- 测试脚本能启动本地 CLI 产物。
- `/codex-api/transcribe` 返回非空文本。
- 脚本不依赖已删除的联网参数。

## 打包安装

### 步骤

1. 运行 `pnpm pack --pack-destination ./release/`。
2. 在干净 Node 18+ 环境中安装生成的 tarball。
3. 执行 `codes --help`。

### 期望

- 包内包含 `dist/`、`dist-cli/`、public 资源和必要脚本。
- 安装不要求已删除运行时依赖。
