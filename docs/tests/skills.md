# 本地 Skills

本分卷只覆盖本机 Codex skills。远程目录、连接器和远程 skills 同步不属于当前产品范围。

## Skills Hub 本地列表

### 前置条件

- `$CODEX_HOME/skills` 下至少有一个用户 skill 或系统 skill。
- CodeS 已启动并可访问。

### 步骤

1. 打开 `#/skills`。
2. 确认页面标题为 `Skills Hub`，只展示已安装的本地 skills。
3. 确认页面没有远程目录、连接器、GitHub sync 或远程搜索入口。
4. 点击一个 skill，确认详情弹窗能读取 `SKILL.md` 内容。
5. 切换 skill enabled 状态，刷新页面后确认状态保持一致。

### 期望

- 列表来自 Codex `skills/list`。
- 详情读取本地 `SKILL.md`。
- 状态通过 Codex `skills/config/write` 写回。

## Composer Skill Picker

### 步骤

1. 打开任意线程或新建线程。
2. 展开 composer 的 Skills 下拉框。
3. 搜索一个本地 skill 并选择。
4. 发送消息。
5. 在聊天记录中点击 skill chip。

### 期望

- 下拉框只展示本地可用 skills 和本地 prompts。
- 被选中的 skill 会附加到请求并显示在已发送消息中。
- skill chip 打开本地 `SKILL.md` 浏览页。

## 用户 Skill 卸载保护

### 步骤

1. 在 `#/skills` 中选择用户安装的 skill。
2. 点击卸载并确认。
3. 尝试对 `.system` 下的系统 skill 执行卸载。

### 期望

- 用户 skill 可从 `$CODEX_HOME/skills/<name>` 删除。
- 系统 skill 不允许通过 UI 删除。
- 删除后列表会强制刷新。

## Try Skill

### 步骤

1. 在 Skills Hub 中打开一个 skill。
2. 点击 Try。
3. 确认新线程或当前新建线程 composer 中带有该 skill。

### 期望

- Try 只生成通用 skill 使用提示。
- 不依赖远程目录或连接器数据。
