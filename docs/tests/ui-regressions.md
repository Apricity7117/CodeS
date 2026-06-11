# 通用 UI 回归

本分卷覆盖无法归入 CLI、Skills、线程/Git 或账号模型的界面回归。检查 light/dark 和桌面/移动视口。

## 布局与主题

### 步骤

1. 在桌面宽度打开首页、线程页和 `#/skills`。
2. 切换 light/dark。
3. 在移动宽度重复上述页面。

### 期望

- 侧栏、header、composer、消息区和 Skills Hub 不重叠。
- 文本不溢出按钮或卡片。
- 移动端侧栏抽屉可打开和关闭。

## Markdown 与代码块

### 步骤

1. 打开包含标题、列表、引用、表格、任务列表和代码块的线程。
2. 展开/折叠长代码块。
3. 复制助手回复。

### 期望

- Markdown 样式在 light/dark 下可读。
- 代码块 copy 按钮可用。
- 复制文本不包含 UI 装饰文案。

## Plan 卡片

### 步骤

1. 使用 Plan mode 发送消息。
2. 等待计划生成。
3. 折叠/展开计划，复制计划，点击实施。

### 期望

- 计划步骤状态显示正确。
- streaming 中和完成后的布局稳定。
- 实施按钮按当前线程继续发送。

## 图片、文件和本地浏览

### 步骤

1. 在 composer 添加图片和文件。
2. 发送消息后点击附件 chip。
3. 打开本地图片预览。
4. 打开 Browse files。

### 期望

- 本地图片通过 `/codex-local-image` 渲染。
- 文件 chip 打开本地 browse URL。
- 预览弹层可关闭，移动端不遮挡 composer。

## Composer 交互

### 步骤

1. 输入多行文本。
2. 添加/移除图片、文件和 skill。
3. 切换 Fast mode / Plan mode。
4. 使用语音输入按钮。

### 期望

- composer 高度随内容变化但不遮挡消息。
- 附件状态和 selected skills 可见。
- 语音输入失败时只影响 dictation，不影响普通发送。

## 不应出现的入口

### 步骤

1. 检查首页、侧栏、设置页、header、线程菜单和 Skills Hub。

### 期望

- 不出现自动化调度入口。
- 不出现内置 terminal 控件。
- 不出现远程目录、连接器或应用市场入口。
- 不出现第三方 provider、免费模式或自定义 endpoint 设置。
