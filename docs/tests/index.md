# 测试文档索引

本目录按当前产品范围拆分手动回归和功能验证步骤。新增测试时优先放入最相关的分卷；如果一个变更跨多个领域，只在主验证领域写完整步骤，并在相关分卷补充交叉验证说明。

## 分卷

- [CLI 与运行时](./cli-runtime.md)：本地启动、局域网访问、dev 脚本、转写后端和打包安装。
- [本地 Skills](./skills.md)：Skills Hub、composer skill picker、本地 `SKILL.md` 读取和用户 skill 卸载保护。
- [线程、Git 与工作树](./threads-git.md)：线程加载、项目、新线程、队列、Git/worktree、changed files、回滚和 review。
- [模型与账号](./providers-accounts.md)：Codex 账号、模型列表、per-thread 模型选择和配额。
- [通用 UI 回归](./ui-regressions.md)：布局、主题、Markdown、Plan 卡片、附件、本地浏览和 composer。

## 章节索引

### CLI 与运行时

- [本地 CLI 启动](./cli-runtime.md#本地-cli-启动)
- [局域网访问与密码](./cli-runtime.md#局域网访问与密码)
- [Dev 脚本](./cli-runtime.md#dev-脚本)
- [语音转写后端](./cli-runtime.md#语音转写后端)
- [打包安装](./cli-runtime.md#打包安装)

### 本地 Skills

- [Skills Hub 本地列表](./skills.md#skills-hub-本地列表)
- [Composer Skill Picker](./skills.md#composer-skill-picker)
- [用户 Skill 卸载保护](./skills.md#用户-skill-卸载保护)
- [Try Skill](./skills.md#try-skill)

### 线程、Git 与工作树

- [线程列表与打开](./threads-git.md#线程列表与打开)
- [新线程与项目选择](./threads-git.md#新线程与项目选择)
- [消息队列与停止](./threads-git.md#消息队列与停止)
- [Git 分支与 Worktree](./threads-git.md#git-分支与-worktree)
- [回滚与 Review](./threads-git.md#回滚与-review)
- [线程菜单](./threads-git.md#线程菜单)

### 模型与账号

- [Codex 账号面板](./providers-accounts.md#codex-账号面板)
- [模型列表](./providers-accounts.md#模型列表)
- [Per-thread 模型选择](./providers-accounts.md#per-thread-模型选择)
- [配额与不可用账号](./providers-accounts.md#配额与不可用账号)

### 通用 UI 回归

- [布局与主题](./ui-regressions.md#布局与主题)
- [Markdown 与代码块](./ui-regressions.md#markdown-与代码块)
- [Plan 卡片](./ui-regressions.md#plan-卡片)
- [图片、文件和本地浏览](./ui-regressions.md#图片文件和本地浏览)
- [Composer 交互](./ui-regressions.md#composer-交互)
- [不应出现的入口](./ui-regressions.md#不应出现的入口)
