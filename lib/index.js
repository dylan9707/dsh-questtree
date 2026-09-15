import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'quest-tree';
export const inject = ['tools', 'systemPrompt'];
export const Config = z.object({
  stateDir: z.string().default('.quest-tree'),
  stateFile: z.string().default('quest.json'),
  promptSectionOrder: z.natural().default(118),
});

const WEB_KEYS = ['webServer', 'httpServer'];
const WS_KEYS = ['workspaceRegistry', 'workspace'];

const STATUS = ['todo', 'in_progress', 'closed', 'decided', 'pending_decision', 'blocked'];
const STATUS_LABEL = {
  todo: '待办',
  in_progress: '进行中',
  closed: '已闭',
  decided: '已拍·未实施',
  pending_decision: '待拍',
  blocked: '阻塞',
};
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const TOOL_NAMES = [
  'quest_tree_create',
  'quest_tree_create_node',
  'quest_tree_update_node',
  'quest_tree_set_current',
  'quest_tree_move_node',
  'quest_tree_delete_node',
  'quest_tree_read',
];

const USAGE_SECTION = [
  'When the user starts a long multi-step task, maintain a quest tree with the quest_tree_* tools so both you and the user always see where the current work sits in the whole flow. A quest tree = one main quest (root) + branches (subtasks) under it.',
  '',
  'Protocol:',
  '1. When a long task begins, call quest_tree_create with a clear main-quest title. If a tree already exists, extend it instead of replacing it.',
  '2. Break the main quest into branches with quest_tree_create_node (parent_id defaults to "root"). Keep node ids human-readable (P1, P1.1, P4.3) or omit them for auto n<seq>.',
  '3. Before working on a branch, call quest_tree_set_current(node_id) so the "你在这" marker tracks the active node; re-point it whenever you switch branches.',
  '4. As a node advances, call quest_tree_update_node to update status/progress/note. Six statuses: todo(待办) / in_progress(进行中) / closed(已闭) / decided(已拍·未实施) / pending_decision(待拍) / blocked(阻塞).',
  '5. When the conversation seems to drift off the main line, call quest_tree_read first to re-anchor, then answer or redirect back to the active branch.',
  '6. When a branch is done, mark it closed and set_current to the next branch (or the root).',
  '',
  'Tools: ' + TOOL_NAMES.join(', '),
].join('\n');

function editorHtmlPath() {
  return fileURLToPath(new URL('../assets/editor.html', import.meta.url));
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

function findNode(tree, id) {
  return tree.nodes.find((n) => n.id === id) ?? null;
}

function childrenOf(tree, id) {
  return tree.nodes.filter((n) => n.parentId === id).sort((a, b) => naturalCompare(a.id, b.id));
}

function rootNode(tree) {
  return tree.nodes.find((n) => n.parentId === null) ?? null;
}

function descendantIds(tree, id) {
  const out = new Set();
  const walk = (cid) => {
    for (const n of tree.nodes) {
      if (n.parentId === cid) { out.add(n.id); walk(n.id); }
    }
  };
  walk(id);
  return out;
}

function emptyTree(name, description, sessionId) {
  const now = Date.now();
  return {
    version: 1,
    name: name ?? '',
    description: description ?? '',
    sessionId: sessionId ?? '',
    createdAt: now,
    updatedAt: now,
    currentNodeId: null,
    nodeSeq: 1,
    nodes: [],
  };
}

function isTree(doc) {
  if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.nodes)) return false;
  if (typeof doc.name !== 'string') return false;
  for (const n of doc.nodes) {
    if (typeof n !== 'object' || n === null) return false;
    if (typeof n.id !== 'string' || !ID_RE.test(n.id)) return false;
    if (n.parentId !== null && typeof n.parentId !== 'string') return false;
    if (typeof n.title !== 'string') return false;
    if (typeof n.status !== 'string' || !STATUS.includes(n.status)) return false;
  }
  return true;
}

async function atomicWriteText(file, content) {
  const tmp = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });
    await rename(tmp, file);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

const locks = new Map();
async function withLock(key, fn) {
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  locks.set(key, previous.then(() => gate));
  await previous;
  try { return await fn(); } finally { release(); }
}

function renderTreeText(tree) {
  const lines = [];
  lines.push('主线：' + (tree.name || '(未命名)'));
  if (tree.description) lines.push('目标：' + tree.description);
  const root = rootNode(tree);
  const walk = (id, depth) => {
    for (const kid of childrenOf(tree, id)) {
      const status = STATUS_LABEL[kid.status] ?? kid.status;
      const mark = kid.id === tree.currentNodeId ? '  ← 你在这' : '';
      const prog = kid.progress ? ' · ' + kid.progress : '';
      lines.push('  '.repeat(depth + 1) + '- ' + kid.id + ' ' + kid.title + ' [' + status + prog + ']' + mark);
      walk(kid.id, depth + 1);
    }
  };
  if (root) {
    const rstatus = STATUS_LABEL[root.status] ?? root.status;
    const rmark = root.id === tree.currentNodeId ? '  ← 你在这' : '';
    lines.push('  - ' + root.id + ' ' + root.title + ' [' + rstatus + ']' + rmark);
    walk(root.id, 0);
  }
  if (tree.currentNodeId) {
    const cur = findNode(tree, tree.currentNodeId);
    if (cur) lines.push('你在这：' + cur.id + ' ' + cur.title);
  }
  return lines.join('\n');
}

export function apply(ctx, config) {
  const resolved = {
    stateDir: config.stateDir ?? '.quest-tree',
    stateFile: config.stateFile ?? 'quest.json',
  };

  ctx.systemPrompt.section({ name: 'quest-tree:usage', order: config.promptSectionOrder ?? 118, text: USAGE_SECTION });

  function workspaceRoot(exec) {
    const ws = ctx.get(WS_KEYS[0]) ?? ctx.get(WS_KEYS[1]);
    if (ws) {
      try { const list = ws.list(); if (list && list.length) return list[0].path; } catch {}
    }
    return exec?.agent?.session?.header?.cwd ?? process.cwd();
  }

  function stateTarget(exec) {
    return join(workspaceRoot(exec), resolved.stateDir, resolved.stateFile);
  }

  async function loadTree(target) {
    try {
      const doc = JSON.parse(await readFile(target, 'utf8'));
      if (!isTree(doc)) throw new Error('任务树文件损坏（格式不合法）');
      return doc;
    } catch (e) {
      if (e && e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async function saveTree(target, tree) {
    tree.updatedAt = Date.now();
    await mkdir(dirname(target), { recursive: true });
    await atomicWriteText(target, JSON.stringify(tree, null, 2));
  }

  function sessionIdOf(exec) {
    return exec?.agent?.id ?? exec?.agent?.session?.header?.sessionId ?? '';
  }

  // ---- quest_tree_create ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_create',
    description: '新建一棵任务树：你成为它的维护者；先建主线（根节点），再挂分支。一个工作区同一时间只维护一棵树。',
    parameters: {
      name: { type: 'string', required: true, description: '主线任务标题' },
      description: { type: 'string', description: '总目标（可选）' },
      overwrite: { type: 'boolean', description: '已存在树时是否覆盖；默认 false（存在则报错）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true }, path: { type: 'string', required: true } } },
      render: (args, value) => [{ type: 'text', text: 'quest tree created: ' + (args.name ?? '') + ' -> ' + value.path }],
    },
    async execute(args, exec) {
      const target = stateTarget(exec);
      return withLock(target, async () => {
        const existing = await loadTree(target);
        if (existing && !args.overwrite) {
          throw new Error('任务树已存在；如需覆盖请传 overwrite: true，或先 quest_tree_read 查看现有树再改');
        }
        const tree = emptyTree(args.name, args.description, sessionIdOf(exec));
        tree.nodes.push({
          id: 'root', parentId: null, title: args.name, status: 'in_progress',
          progress: '', note: '', createdAt: Date.now(), updatedAt: Date.now(),
        });
        tree.currentNodeId = 'root';
        await saveTree(target, tree);
        return { ok: true, path: target };
      });
    },
  }));

  // ---- quest_tree_create_node ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_create_node',
    description: '新建一个分支节点，挂到指定父节点下（主线根由 quest_tree_create 建立）。',
    parameters: {
      title: { type: 'string', required: true, description: '节点标题' },
      parent_id: { type: 'string', description: '父节点 id；省略默认 "root"' },
      id: { type: 'string', description: '自定义节点 id（如 P1、P4.3），须匹配 [A-Za-z0-9][A-Za-z0-9._-]*；省略则自动 n<序号>' },
      status: { type: 'string', enum: STATUS, description: '六档状态；默认 todo' },
      progress: { type: 'string', description: '进度自由文本（如「已做大半·未验收」）' },
      note: { type: 'string', description: 'markdown 备注' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true }, parent_id: { type: 'string', required: true } } },
      render: (args, value) => [{ type: 'text', text: 'node ' + value.id + ' created under ' + value.parent_id }],
    },
    async execute(args, exec) {
      const target = stateTarget(exec);
      return withLock(target, async () => {
        const tree = await loadTree(target);
        if (!tree) throw new Error('还没有任务树，先 quest_tree_create');
        const parentId = args.parent_id ?? 'root';
        if (!findNode(tree, parentId)) throw new Error('父节点不存在：' + parentId);
        const status = args.status ?? 'todo';
        if (!STATUS.includes(status)) throw new Error('status 必须是 ' + STATUS.join('/'));
        let id = args.id;
        if (id === undefined || id === null || id === '') {
          id = 'n' + tree.nodeSeq;
          tree.nodeSeq += 1;
        } else {
          if (!ID_RE.test(id)) throw new Error('id 只能含字母/数字/._-，且以字母数字开头：' + id);
          if (findNode(tree, id)) throw new Error('id 已存在：' + id);
        }
        const now = Date.now();
        tree.nodes.push({
          id, parentId, title: args.title, status,
          progress: args.progress ?? '', note: args.note ?? '',
          createdAt: now, updatedAt: now,
        });
        await saveTree(target, tree);
        return { id, parent_id: parentId };
      });
    },
  }));

  // ---- quest_tree_update_node ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_update_node',
    description: '更新节点的标题、状态、进度或备注；一次可只改一项，也可同时改多项。',
    parameters: {
      node_id: { type: 'string', required: true, description: '目标节点 id' },
      title: { type: 'string', description: '新标题' },
      status: { type: 'string', enum: STATUS, description: '六档状态' },
      progress: { type: 'string', description: '进度自由文本' },
      note: { type: 'string', description: 'markdown 备注' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true } } },
      render: (args, value) => [{ type: 'text', text: 'node ' + value.id + ' updated' }],
    },
    async execute(args, exec) {
      if (args.title === undefined && args.status === undefined && args.progress === undefined && args.note === undefined) {
        throw new Error('至少提供一个要更新的字段：title/status/progress/note');
      }
      if (args.status !== undefined && !STATUS.includes(args.status)) throw new Error('status 必须是 ' + STATUS.join('/'));
      const target = stateTarget(exec);
      return withLock(target, async () => {
        const tree = await loadTree(target);
        if (!tree) throw new Error('还没有任务树，先 quest_tree_create');
        const node = findNode(tree, args.node_id);
        if (!node) throw new Error('节点不存在：' + args.node_id);
        if (args.title !== undefined) node.title = args.title;
        if (args.status !== undefined) node.status = args.status;
        if (args.progress !== undefined) node.progress = args.progress;
        if (args.note !== undefined) node.note = args.note;
        node.updatedAt = Date.now();
        await saveTree(target, tree);
        return { id: args.node_id };
      });
    },
  }));

  // ---- quest_tree_set_current ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_set_current',
    description: '把「你在这」标记移到指定节点，用于记录当前聚焦的分支。',
    parameters: {
      node_id: { type: 'string', required: true, description: '要标记为「你在这」的节点 id' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { current_node_id: { type: 'string', required: true } } },
      render: (args, value) => [{ type: 'text', text: '你在这 -> ' + value.current_node_id }],
    },
    async execute(args, exec) {
      const target = stateTarget(exec);
      return withLock(target, async () => {
        const tree = await loadTree(target);
        if (!tree) throw new Error('还没有任务树，先 quest_tree_create');
        if (!findNode(tree, args.node_id)) throw new Error('节点不存在：' + args.node_id);
        tree.currentNodeId = args.node_id;
        await saveTree(target, tree);
        return { current_node_id: args.node_id };
      });
    },
  }));

  // ---- quest_tree_move_node ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_move_node',
    description: '把节点连同其子树移动到新的父节点下，用于调整分支归属。',
    parameters: {
      node_id: { type: 'string', required: true, description: '要移动的节点 id' },
      new_parent_id: { type: 'string', required: true, description: '新的父节点 id' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true }, parent_id: { type: 'string', required: true } } },
      render: (args, value) => [{ type: 'text', text: 'node ' + value.id + ' moved under ' + value.parent_id }],
    },
    async execute(args, exec) {
      const target = stateTarget(exec);
      return withLock(target, async () => {
        const tree = await loadTree(target);
        if (!tree) throw new Error('还没有任务树，先 quest_tree_create');
        const node = findNode(tree, args.node_id);
        if (!node) throw new Error('节点不存在：' + args.node_id);
        if (node.parentId === null) throw new Error('根节点（主线）不能移动');
        if (args.node_id === args.new_parent_id) throw new Error('不能把节点移到它自己下面');
        if (!findNode(tree, args.new_parent_id)) throw new Error('新父节点不存在：' + args.new_parent_id);
        if (descendantIds(tree, args.node_id).has(args.new_parent_id)) {
          throw new Error('不能把节点移到它自己的子节点下面');
        }
        node.parentId = args.new_parent_id;
        node.updatedAt = Date.now();
        await saveTree(target, tree);
        return { id: args.node_id, parent_id: args.new_parent_id };
      });
    },
  }));

  // ---- quest_tree_delete_node ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_delete_node',
    description: '删除一个节点；其子树一并删除。根节点（主线）不可删除。',
    parameters: {
      node_id: { type: 'string', required: true, description: '要删除的节点 id' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { deleted: { type: 'number', required: true } } },
      render: (args, value) => [{ type: 'text', text: 'deleted ' + value.deleted + ' node(s)' }],
    },
    async execute(args, exec) {
      const target = stateTarget(exec);
      return withLock(target, async () => {
        const tree = await loadTree(target);
        if (!tree) throw new Error('还没有任务树，先 quest_tree_create');
        const node = findNode(tree, args.node_id);
        if (!node) throw new Error('节点不存在：' + args.node_id);
        if (node.parentId === null) throw new Error('根节点（主线）不能删除');
        const doomed = descendantIds(tree, args.node_id);
        doomed.add(args.node_id);
        tree.nodes = tree.nodes.filter((n) => !doomed.has(n.id));
        if (tree.currentNodeId && doomed.has(tree.currentNodeId)) {
          tree.currentNodeId = rootNode(tree)?.id ?? null;
        }
        await saveTree(target, tree);
        return { deleted: doomed.size };
      });
    },
  }));

  // ---- quest_tree_read ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_read',
    description: '读取整棵任务树，返回主线与全部分支的状态、进度、备注与「你在这」位置。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: renderTreeText(value) }],
    },
    async execute(args, exec) {
      const target = stateTarget(exec);
      const tree = await loadTree(target);
      if (!tree) {
        return { version: 1, name: '', description: '', nodes: [], currentNodeId: null, nodeSeq: 1 };
      }
      return tree;
    },
  }));

  // ---- HTTP surface (lazy, webless-safe) ----
  let webRegistered = false;
  const registerWebSurface = () => {
    if (webRegistered) return;
    const web = ctx.get(WEB_KEYS[0]) ?? ctx.get(WEB_KEYS[1]);
    const ws = ctx.get(WS_KEYS[0]) ?? ctx.get(WS_KEYS[1]);
    if (web === undefined || ws === undefined) return;
    webRegistered = true;

    ctx.effect(() => web.register({
      kind: 'exact',
      path: '/plugins/quest-tree/state',
      handler: async (req, res) => {
        try {
          const roots = ws.list().map((w) => w.path);
          const target = join(roots[0] ?? process.cwd(), resolved.stateDir, resolved.stateFile);
          if (req.method === 'GET') {
            let doc = {};
            try { doc = JSON.parse(await readFile(target, 'utf8')); } catch {}
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            res.end(JSON.stringify(doc));
          } else {
            res.writeHead(405); res.end();
          }
        } catch (error) {
          ctx.logger?.warn?.('quest-tree: state route ' + String(error));
          res.writeHead(500); res.end(String(error));
        }
      },
    }), 'quest-tree: state route');

    ctx.effect(() => web.register({
      kind: 'exact',
      path: '/plugins/quest-tree/editor',
      handler: async (_req, res) => {
        try {
          const html = await readFile(editorHtmlPath(), 'utf8');
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(html);
        } catch (error) {
          ctx.logger?.warn?.('quest-tree: editor route ' + String(error));
          res.writeHead(500); res.end(String(error));
        }
      },
    }), 'quest-tree: editor route');
  };
  registerWebSurface();
  ctx.on('internal/service', (name) => {
    if (WEB_KEYS.includes(name) || WS_KEYS.includes(name)) registerWebSurface();
  });
}
