# 线程、Git 与工作树

本分卷覆盖聊天线程、项目、Git/worktree、回滚和队列。自动化调度、外部补丁脚本和自定义 endpoint proxy 不属于当前范围。

## 线程列表与打开

### 步骤

1. 启动 CodeS 并打开首页。
2. 搜索线程标题或项目路径。
3. 打开一个旧线程。
4. 返回首页再打开另一个线程。

### 期望

- Pinned、Projects、Chats 分组稳定。
- 切换线程不会丢失当前消息缓存。
- 旧线程懒加载后自动滚动到最新消息。

## 新线程与项目选择

### 步骤

1. 在首页选择本地项目目录。
2. 发送首条消息。
3. 使用 Create Project 创建一个新目录。
4. 再次发送首条消息。

### 期望

- 新线程 cwd 与选择目录一致。
- 新项目会创建目录并出现在项目列表中。
- 未选择目录时按默认工作目录创建 projectless thread。

## 消息队列与停止

### 步骤

1. 在一个运行中的线程继续发送消息。
2. 分别选择 Queue 和 Steer。
3. 点击 Stop。

### 期望

- Queue 消息进入待发送队列。
- Steer 按当前线程状态提交。
- Stop 能及时中断活跃 turn，且不会丢失 turnId。

## Git 分支与 Worktree

### 步骤

1. 选择一个 Git 项目。
2. 打开新线程 header 的分支选择器。
3. 创建 New worktree 并选择 base branch。
4. 在 worktree 线程中执行一次会修改文件的请求。

### 期望

- 非 Git 目录隐藏 worktree 控件。
- 分支列表按最近活动排序。
- worktree 线程归属到 canonical project。
- 变更文件面板能展示本 turn 的 changed files。

## 回滚与 Review

### 步骤

1. 在 Git 项目中触发一次文件变更。
2. 打开 changed files 面板并查看 diff。
3. 执行 rollback。
4. 打开 Review 面板并运行 review。

### 期望

- rollback 可还原 apply_patch 和普通文件写入。
- Review 支持 staged/workspace 视图。
- 无 Git 仓库时显示初始化提示而不是抛错。

## 线程菜单

### 步骤

1. 打开线程菜单。
2. 依次验证 Copy path、Export chat、Create chat fork、Rename thread、Delete thread。
3. 在项目菜单验证 Browse files、Copy path、Rename project。

### 期望

- 菜单中不存在自动化调度入口。
- 删除/归档后侧栏状态刷新。
- fork thread 能保留正确 anchor。
