<p align="right">简体中文</p>

<h1 align="center">dsh-questtree</h1>

<p align="center">
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-202724" alt="DeepSeek Harness plugin">
  <img src="https://img.shields.io/npm/v/dsh-questtree" alt="npm version">
</p>

> 任务树（Quest Tree）—— 把一个长任务维护成一张**项目作战地图**：目标、里程碑、任务、验收项、证据，以及「下一步」。

一个 DeepSeek Harness 插件。它给每个工作区维护**一棵共享的项目树**（同一 workspace 的所有会话看到同一张地图），每个会话只记录自己的「你在这」，并把一组 `quest_tree_*` 工具注册进共享工具表、把一段使用说明注入全局系统提示。右侧边栏是一个原生 React 面板：树 / 看板 / 一页简报三种视图，验收进度、证据缺口、阻塞与关键路径都在第一屏，实施记录里的文件可**直接点开跳到 `file:line`**。

## 能做什么

| 能力 | 解决什么 |
| --- | --- |
| **项目级共享树** | 同一 workspace 一棵树；新会话打开即恢复「上次做到哪、缺什么证据」，不再每个会话各记各的 |
| **验收契约** | 每个任务带 `doneWhen`（验收项）与 `verify`（验证命令），面板显示「验收 3/5」而不是自欺的百分比 |
| **证据化完成** | `closed` 必须带证据覆盖全部验收项，并通过一次评审；`implemented` 只代表「代码写了、待验」 |
| **评审门** | `implemented` → `quest_tree_review`（pass / needs_revision）→ 才能 `closed`；needs_revision 自动退回进行中 |
| **负责人绑定** | 节点可设 `owner`（队友 / AgentTeams 成员名），面板行、看板卡片与详情都显示 `@负责人` |
| **加权进度 + 计数** | 进度按权重计算；顶部固定显示 待拍 / 进行中 / 待验 / 阻塞 / 已闭，报告不再只有「60%」 |
| **下一步** | 从依赖就绪 + 祖先未闭的节点里算 ready 集合，面板底部固定「下一步」，agent 每轮先看它 |
| **代码直链** | 节点 `files: [{path, line, endLine}]`，实施记录里的文件名直接打开侧栏文件并跳到对应行 |
| **事件日志** | 状态迁移 append-only；返工（implemented/closed → decided）自动计数 |
| **漂移哨兵 + 停靠区** | 临时支线用 `quest_tree_park` 停靠，不占 next 和进度；主线不被打断 |
| **交接简报** | `quest_tree_handoff` 生成「目标 / 进度 / 当前分支 / 剩余验收 / 证据缺口 / 下一步 / 待拍问题」 |
| **看板与简报** | 按状态分列的看板、可直接贴给用户或下个会话的一页 markdown 简报 |

## 工具

| 工具 | 作用 |
| --- | --- |
| `quest_tree_create` | 新建项目树（主线根 + 目标） |
| `quest_tree_plan` | 一次铺开整棵树：批量建分支，每个任务带 `doneWhen` / `verify` / `blockedBy` |
| `quest_tree_create_node` | 追加一个分支节点（可自定义 id，如 `P1`、`P4.3`） |
| `quest_tree_update_node` | 更新标题 / 状态 / 进度 / 备注 / 决策 / 实施 preview / 验收项 / 改动文件 / 链接 / 依赖 / 负责人 / 权重 / 停靠 |
| `quest_tree_evidence` | 添加完成证据（测试 / 命令 / diff / 文件 / 评审 / 人工），`covers` 指定覆盖的验收项，`close: true` 覆盖齐全且已评审时自动关闭 |
| `quest_tree_review` | 评审 implemented 节点：`pass` 通过（之后才能关闭），`needs_revision` 退回进行中 |
| `quest_tree_park` | 停靠一个临时想法 / 支线（parked，不占 next 与进度） |
| `quest_tree_set_current` | 移动本会话的「你在这」标记（不影响其他会话） |
| `quest_tree_move_node` | 把节点连同子树移到新父节点下 |
| `quest_tree_delete_node` | 删除节点（子树一并删除；根不可删） |
| `quest_tree_read` | 读取整棵树 + 指标 + 下一步 + 阻塞 + 简报；每轮开工先读它定锚 |
| `quest_tree_handoff` | 生成交接简报（markdown） |

## 用法

在对话里直接说：

```
把「重构登录重试」建成项目树，任务都带验收项，然后开始做
```

agent 会先用 `quest_tree_plan` 一次铺开（每个任务带 `doneWhen` / `verify`），边做边更新状态。

### 完成一个任务

```
quest_tree_update_node { node_id: "P2", status: "implemented", owner: "reviewer-a",
  files: [{ path: "src/login/retry.ts", line: 40, endLine: 88 }],
  implementation: "改了 retry.ts:40-88；退避改指数；npm test 通过" }

quest_tree_evidence { node_id: "P2", kind: "test", ref: "npm test -> 42 passed", covers: ["*"] }

quest_tree_review { node_id: "P2", verdict: "pass", note: "逐条核对 3 项验收，证据与 diff 一致" }

quest_tree_evidence { node_id: "P2", covers: ["*"], close: true }
```

规则：

- `implemented` 前至少要有 `files` 或 `links` 指向真实改动（`force: true` 可跳过，会记录 `forced`）。
- `closed` 前每条 `doneWhen` 都要被证据覆盖；`covers` 可用验收项文本、序号或 `"*"`（全部）。
- `closed` 前还要有 `quest_tree_review` 的 `pass`；`needs_revision` 会把节点退回 `in_progress`，改完重新 `implemented` 再评。
- 没有验收项的节点，关闭时至少一条证据。
- 同时最多 2 个 `in_progress`（含里程碑但根除外的任务节点）；超了会拒绝，先收尾或 `force`。

### 漂移与停靠

用户消息看起来像新支线时，先 `quest_tree_park` 停靠成 `parked` 的 idea 节点，再决定是否切换主线；停靠节点不进入 next、不计进度。

## 面板

右侧边栏一个「任务树」标签页（原生 React，非 iframe）：

- **顶部**：目标、加权进度条、待拍 / 进行中 / 待验 / 待评审 / 阻塞 / 已闭 / 验收覆盖 / 返工计数。
- **当前**：面包屑显示「你在这」。
- **告警**：阻塞、待验收、待评审、缺验收证据、关键路径（解锁数最多的节点）。
- **三种视图**：树（默认，支持搜索与折叠）、看板（按状态分列）、简报（markdown，可直接复制）。
- **节点详情**（点标题展开）：决策 / 实施 preview / 评审（结论、时间、意见）/ 验收 checklist（✓ 表示已有证据覆盖）/ 证据列表 / 改动文件 / 关联 / 依赖 / 备注。
- **评审标记**：implemented 节点行显示「评审✓」或「待评审」；负责人显示 `@name`。
- **文件直链**：点详情里的文件名，侧栏打开该文件并跳到 `line`（通过 `sidebarRight.openResource` + `dsh-resource://file/...` 地址，与内置「代码审查」面板相同的导航）。
- **你在这**：当前会话的节点高亮；其他会话移动自己的标记不影响你。

## 数据存储

- 一棵项目树：`<workspace>/.quest-tree/project.json`（`stateRoot` 配置可覆盖到固定目录）。
- 每个会话的「你在这」：`<workspace>/.quest-tree/sessions/<sessionId>.json`（只存 `currentNodeId`）。
- 树内节点记录验收项、证据、改动文件与事件日志；事件最多保留 400 条。
- 迁移（只读，首次写入时迁走）：
  - `~/.dsh/storages/dsh-questtree/sessions/<sessionId>.json`（0.3 的全局按会话树）
  - `<workspace>/.quest-tree/sessions/<sessionId>.json`（0.2 的按工作区会话树）
  - `<workspace>/.quest-tree/quest.json`（更早的单文件树，要求 `sessionId` 匹配）

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
    stateRoot: ''           # 项目树根目录；空 = <workspace>/.quest-tree
    stateDir: .quest-tree   # 工作区内的目录名（也是迁移源）
    stateFile: quest.json   # 旧单文件树名（迁移用）
    promptSectionOrder: 118 # 使用说明在系统提示中的顺序
```

## 指标口径

- **进度**：已闭节点权重 / 全部未停靠节点权重（根节点参与权重）。
- **验收覆盖**：被证据覆盖的 `doneWhen` 项 / 全部验收项。
- **返工**：状态事件里 `implemented` 或 `closed` → `decided` 的次数。
- **阻塞老化**：`blockedSince` 起算的天数。
- **关键路径**：解锁节点数最多的前 6 个节点。

## 边界

- 任务树是「计划 / 进度」的可见化，不是权威事实源；改代码仍以真实仓库为准。
- `decision` / `implementation` 是给人看的记录，不替代设计记录或源码；冲突时以仓库为准。
- `decided` 只表示拍板，`implemented` 只表示代码已写，都不代表用户验收；验收才 `closed`。
- 跨 DSH 进程不协调并发写；单进程内用文件锁 + 原子写保证一致。
- 根节点（主线）不能移动、不能删除。

## 开发

```sh
npm run check   # 加载 lib/index.js，打印 Config/apply/inject/name
```

| 文件 | 作用 | 改完生效 |
| --- | --- | --- |
| `lib/index.js` | host：12 个工具 + 系统提示 + 项目树/overlay 存储 + 状态路由 | 重启 dsh |
| `lib/client.js` | 右侧边栏原生 React 面板（树/看板/简报、详情、文件直链） | 重启 dsh |
| `assets/editor.html` | 早期 iframe 面板（保留 `/plugins/quest-tree/editor` 路由） | 刷新即见 |
| `locale/*.json` | 插件元信息（标题 / 描述）双语 | 重启生效 |

## License

MIT
