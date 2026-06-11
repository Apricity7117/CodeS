# extract-codex-icons 使用说明

## 功能概述

`scripts/extract-codex-icons.mjs` 用于从 Codex App/anti-codex 的 webview 打包产物中抽取纯 SVG 图标组件，并生成 CodeS 可直接使用的 Vue 单文件组件。

脚本会自动跳过非 SVG 导出、业务组件、依赖 React hooks 或运行时上下文的复杂组件。

## 环境依赖

- Node.js 18 或更高版本
- 默认来源目录存在：`/Users/a/Projects/js/anti-codex/src/webview/assets`

## 使用方法

```bash
node scripts/extract-codex-icons.mjs
```

默认输出到：

```text
src/components/icons/codex
```

## 参数说明

- `--source-dir <path>`：指定 Codex webview assets 来源目录。
- `--output-dir <path>`：指定 Vue 图标组件输出目录。
- `--dry-run`：只打印可抽取图标，不写入文件。
- `-h, --help`：显示帮助。

## 使用示例

预览可抽取图标：

```bash
node scripts/extract-codex-icons.mjs --dry-run
```

从默认来源生成图标：

```bash
node scripts/extract-codex-icons.mjs
```

指定来源和输出目录：

```bash
node scripts/extract-codex-icons.mjs \
  --source-dir /Applications/Codex.app.extracted/webview/assets \
  --output-dir src/components/icons/codex
```

## 输出说明

脚本会生成：

- `IconCodex*.vue`：单个 Vue 图标组件。
- `index.ts`：统一导出入口。
- `manifest.ts`：组件与来源文件映射清单。

生成的图标统一使用 `width="1em"`、`height="1em"`、`currentColor`，可继承父级字号和颜色。

## 注意事项

- 脚本会先删除并重建输出目录。
- 来源文件是打包产物，文件名包含 hash；脚本会自动去掉 hash 并生成稳定组件名。
- 多 SVG 导出的来源模块会生成多个组件，并在第二个开始追加数字后缀。
