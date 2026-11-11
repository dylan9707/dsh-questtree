<p align="right">简体中文</p>

<h1 align="center">dsh-questtree</h1>

<p align="center">
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-202724" alt="DeepSeek Harness plugin">
  <img src="https://img.shields.io/npm/v/dsh-questtree" alt="npm version">
</p>

> 任务树（Quest Tree）—— 把一个长任务维护成**一条主线 + 一棵分支树**，你和 agent 随时都能看到「当前做到哪、整条线还剩什么」。

一个 DeepSeek Harness 插件。它在工作区里**为每个会话各维护一棵任务树**（主线根 + 分支节点），并把一组 `quest_tree_*` 工具注册进共享工具表、把一段使用说明注入全局系统提示，于是每个会话都能用自然语言维护自己的任务树，右侧边栏按当前会话实时展示，防止长任务跑偏。

## 能做什么

| 能力 | 解决什么 |
| --- | --- |
| **主线 + 分支树** | 长任务拆成一棵有主线的树，进度一眼看全，不用翻聊天记录 |
| **六档状态** | `todo` / `in_progress` / `closed` / `decided` / `pending_decision` / `blocked`，每档有中文标注 |
| **「你在这」标记** | `set_current` 把当前聚焦分支钉住，agent 切换分支时重新指向 |
| **Markdown 备注 + 进度** | 每个节点可写进度自由文本和 markdown 备注 |
| **每个会话一棵树** | 会话之间互不干扰：切到哪个会话，右侧边栏就显示那个会话自己的任务树 |
| **右侧边栏面板（Web GUI）** | 右侧边栏一个「任务树」标签页，实时看树、展开分支、查看 markdown 备注 |
| **自动防跑题** | 系统提示让 agent 在会话跑偏时先 `quest_tree_read` 重新锚定 |

## 工具

| 工具 | 作用 |
| --- | --- |
| `quest_tree_create` | 新建任务树（先建主线根） |
| `quest_tree_create_node` | 挂分支节点到指定父节点下（可自定义 id 或自动编号） |
| `quest_tree_update_node` | 更新节点标题 / 状态 / 进度 / 备注 |
| `quest_tree_set_current` | 把「你在这」标记移到指定节点 |
| `quest_tree_move_node` | 把节点连同子树移到新父节点下 |
| `quest_tree_delete_node` | 删除节点（子树一并删除；根不可删） |
| `quest_tree_read` | 读取整棵树（主线 + 全部分支 + 状态 + 「你在这」） |

## 用法

在对话里直接说（自然语言）：

```
把「重构登录重试」建成任务树，拆成几个分支
```

agent 会 `quest_tree_create` 建主线、`quest_tree_create_node` 拆分支，边做边 `quest_tree_update_node` 更新状态，切换分支时 `quest_tree_set_current` 移动「你在这」标记。

## 数据存储

- 任务树状态按会话隔离：`<workspace>/.quest-tree/sessions/<sessionId>.json`（`{ version, name, description, sessionId, currentNodeId, nodeSeq, nodes[] }`）。
- 旧版单文件 `<workspace>/.quest-tree/quest.json` 只用于兼容：里面记录的 `sessionId` 与当前会话一致时，首次打开（或首次写入）会自动沿用并迁移到该会话自己的文件。
- 一个会话同一时间只维护一棵树；`overwrite: true` 才能覆盖现有树。

## 安装

```sh
# npm（发布后）
dsh plugin --profile <name> add dsh-questtree

# 本地路径
dsh plugin --profile <name> add <path-to-dsh-questtree>
```

## 配置

```yaml
- id: quest-tree
  name: 'dsh-questtree'
  config:
    stateDir: .quest-tree   # 状态目录（相对于工作区根）
    stateFile: quest.json   # 状态文件名
```

## 边界

- 任务树是「进度 / 计划」的可见化，不是权威事实源——改代码仍以真实仓库为准。
- 状态存工作区文件，跨 DSH 进程不协调并发写（单进程内用锁 + 原子写保证一致）。
- 根节点（主线）不能移动、不能删除。

## 开发

改完验证 host 面：

```sh
npm run check
```

| 文件 | 作用 | 改完生效 |
| --- | --- | --- |
| `lib/index.js` | host：`quest_tree_*` 工具 + 系统提示 + 按会话读写 + 侧栏/编辑器路由 | 重启 `dsh web` |
| `lib/client.js` | 右侧边栏标签页 + iframe 外壳（带当前会话 id） | 重启 `dsh web` |
| `assets/editor.html` | 树编辑器 UI | 刷新面板即见 |
| `locale/*.json` | 面板元信息（标题 / 描述）双语 | 重启生效 |

## License

MIT
