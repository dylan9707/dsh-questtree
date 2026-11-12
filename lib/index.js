import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const name = 'quest-tree';
export const inject = ['tools', 'systemPrompt'];
export const Config = z.object({
  stateDir: z.string().default('.quest-tree'),
  stateFile: z.string().default('quest.json'),
  stateRoot: z.string().default(''),
  promptSectionOrder: z.natural().default(118),
});

const WEB_KEYS = ['webServer', 'httpServer'];
const WS_KEYS = ['workspaceRegistry', 'workspace'];

const SCHEMA_VERSION = 2;
const MAX_EVENTS = 400;
const WIP_LIMIT = 2;
const MAX_TEXT = 20000;

const STATUS = ['todo', 'in_progress', 'closed', 'decided', 'implemented', 'pending_decision', 'blocked'];
const STATUS_LABEL = {
  todo: '待办',
  in_progress: '进行中',
  closed: '已闭',
  decided: '已拍·未实施',
  implemented: '已拍·已实施',
  pending_decision: '待拍',
  blocked: '阻塞',
};
const KIND = ['milestone', 'task', 'question', 'idea', 'step'];
const KIND_LABEL = { milestone: '里程碑', task: '任务', question: '问题', idea: '想法', step: '步骤' };
const LINK_KINDS = ['agent-teams', 'commit', 'pr', 'issue', 'session', 'doc', 'url'];
const EVIDENCE_KINDS = ['test', 'command', 'diff', 'file', 'review', 'manual', 'link'];
const REVIEW_VERDICTS = ['pass', 'needs_revision'];

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UNSAFE_FILE_CHARS = /[^A-Za-z0-9._-]+/g;

function safeFileStem(id) {
  return String(id).replace(UNSAFE_FILE_CHARS, '_').slice(0, 120) || 'session';
}

const TOOL_NAMES = [
  'quest_tree_create',
  'quest_tree_plan',
  'quest_tree_create_node',
  'quest_tree_update_node',
  'quest_tree_evidence',
  'quest_tree_review',
  'quest_tree_park',
  'quest_tree_set_current',
  'quest_tree_move_node',
  'quest_tree_delete_node',
  'quest_tree_read',
  'quest_tree_handoff',
];

const USAGE_SECTION = [
  'Maintain a quest tree with the quest_tree_* tools whenever a task is longer than a single exchange, so you and the user always see where the work sits in the whole flow. A tree = one main quest (root) + branches; each branch carries its acceptance contract and its evidence.',
  '',
  'Anchor before acting: call quest_tree_read at the start of a turn (or read the 任务树 panel brief) and restate goal / current node / next ready node before choosing work. Never work from chat history alone.',
  '',
  'Plan with acceptance, not with prose: quest_tree_plan lays out milestone -> task branches in one call; every task node needs doneWhen (array of checkable acceptance items) and verify (commands). A node without acceptance is an idea (kind idea), not a task. quest_tree_read returns the next ready set (dependency-ready todo nodes): pick from it instead of improvising.',
  '',
  'Statuses: todo(待办) / in_progress(进行中, at most 2) / closed(已闭) / decided(已拍·未实施) / implemented(已拍·已实施, awaiting verification) / pending_decision(待拍) / blocked(阻塞). implemented requires at least one files or links entry; closed requires evidence covering every doneWhen item AND a passing review (quest_tree_review verdict: pass, after checking evidence against the acceptance items). Set owner to the teammate / AgentTeams member who carries the node. force: true only for documented exceptions — it records a forced event.',
  '',
  'Implementation must leave a trail: quest_tree_update_node with files [{path, line, endLine}] and links [{kind, ref}] (commit / pr / agent-teams task / issue). The right sidebar panel renders file:line chips that jump straight to the changed code.',
  '',
  'Interview protocol: under each task, create one child node per decision it needs, status pending_decision (待拍). That child list is the interview agenda. Ask one question at a time, quest_tree_set_current on it, record trade-offs in note; after the user rules, write the ruling into decision (choice, reason, rejected options) and set decided. Never invent a ruling.',
  '',
  'Drift sentinel: when the user shifts topic, do not abandon the tree. quest_tree_park the side topic (kind idea, parked) and answer it, or quest_tree_set_current first when the main line really moves. Parked nodes are hidden from next and from progress.',
  '',
  'Handoff: quest_tree_handoff prints the goal, progress, current branch, remaining acceptance, evidence gaps and next steps — use it for a new session, a teammate, or a status report.',
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

function depthOf(tree, id) {
  let depth = 0;
  let cur = findNode(tree, id);
  const guard = new Set();
  while (cur && cur.parentId !== null && !guard.has(cur.id)) {
    guard.add(cur.id);
    cur = findNode(tree, cur.parentId);
    depth += 1;
  }
  return depth;
}

function breadcrumbOf(tree, id) {
  const out = [];
  let cur = findNode(tree, id);
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId === null ? null : findNode(tree, cur.parentId);
  }
  return out;
}

function preorder(tree) {
  const out = [];
  const root = rootNode(tree);
  if (!root) return tree.nodes.map((node) => ({ node, depth: 0 }));
  out.push({ node: root, depth: 0 });
  const walk = (id, depth) => {
    for (const child of childrenOf(tree, id)) {
      out.push({ node: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(root.id, 1);
  return out;
}

function strArray(value) {
  const raw = Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
  const out = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (text) out.push(text.slice(0, 2000));
  }
  return out;
}

function splitPathLine(text) {
  const m = /^(.*?):(\d+)(?:-(\d+))?$/.exec(String(text).trim());
  if (m && m[1]) {
    const line = Number(m[2]);
    const endLine = m[3] ? Number(m[3]) : null;
    return { path: m[1], line: line > 0 ? line : null, endLine: endLine && endLine > 0 ? endLine : null };
  }
  return { path: String(text).trim(), line: null, endLine: null };
}

function fileArray(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      const parsed = splitPathLine(raw);
      if (!parsed.path) return null;
      out.push(parsed);
      continue;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const path = typeof raw.path === 'string' ? raw.path.trim() : '';
    if (!path) return null;
    const line = Number(raw.line);
    const endLine = Number(raw.endLine);
    out.push({
      path,
      line: Number.isFinite(line) && line > 0 ? Math.floor(line) : null,
      endLine: Number.isFinite(endLine) && endLine > 0 ? Math.floor(endLine) : null,
    });
  }
  return out;
}

function linkArray(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      const [kindRaw, ...rest] = raw.split(':');
      const kind = kindRaw.trim();
      const ref = rest.join(':').trim();
      if (!ref) return null;
      out.push({ kind: LINK_KINDS.includes(kind) ? kind : 'url', ref, label: '' });
      continue;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const ref = typeof raw.ref === 'string' ? raw.ref.trim() : '';
    if (!ref) return null;
    const kind = typeof raw.kind === 'string' && LINK_KINDS.includes(raw.kind) ? raw.kind : 'url';
    const label = typeof raw.label === 'string' ? raw.label.slice(0, 200) : '';
    out.push({ kind, ref, label });
  }
  return out;
}

function evidenceArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const ref = typeof raw.ref === 'string' ? raw.ref.trim() : '';
    if (!ref) continue;
    out.push({
      id: typeof raw.id === 'string' ? raw.id : 'ev',
      kind: EVIDENCE_KINDS.includes(raw.kind) ? raw.kind : 'manual',
      ref: ref.slice(0, 4000),
      note: typeof raw.note === 'string' ? raw.note.slice(0, 4000) : '',
      covers: strArray(raw.covers),
      at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : Date.now(),
      by: typeof raw.by === 'string' ? raw.by : '',
    });
  }
  return out;
}

function reviewObject(value) {
  if (typeof value !== 'object' || value === null) return null;
  if (!REVIEW_VERDICTS.includes(value.verdict)) return null;
  return {
    verdict: value.verdict,
    note: typeof value.note === 'string' ? value.note.slice(0, 4000) : '',
    by: typeof value.by === 'string' ? value.by : '',
    at: Number.isFinite(Number(value.at)) ? Number(value.at) : Date.now(),
  };
}

function normalizeNode(raw) {
  const node = {
    id: String(raw.id),
    parentId: raw.parentId === null || raw.parentId === undefined ? null : String(raw.parentId),
    title: typeof raw.title === 'string' ? raw.title.slice(0, 300) : '',
    status: STATUS.includes(raw.status) ? raw.status : 'todo',
    kind: KIND.includes(raw.kind) ? raw.kind : (raw.parentId === null ? 'milestone' : 'task'),
    weight: Number.isFinite(Number(raw.weight)) ? Math.max(0, Number(raw.weight)) : 1,
    progress: typeof raw.progress === 'string' ? raw.progress.slice(0, 2000) : '',
    note: typeof raw.note === 'string' ? raw.note.slice(0, MAX_TEXT) : '',
    decision: typeof raw.decision === 'string' ? raw.decision.slice(0, MAX_TEXT) : '',
    implementation: typeof raw.implementation === 'string' ? raw.implementation.slice(0, MAX_TEXT) : '',
    doneWhen: strArray(raw.doneWhen),
    verify: strArray(raw.verify),
    files: fileArray(raw.files) ?? [],
    links: linkArray(raw.links) ?? [],
    blockedBy: strArray(raw.blockedBy),
    parked: raw.parked === true,
    blockedSince: Number.isFinite(Number(raw.blockedSince)) ? Number(raw.blockedSince) : null,
    evidence: evidenceArray(raw.evidence),
    owner: typeof raw.owner === 'string' ? raw.owner.slice(0, 120) : '',
    review: reviewObject(raw.review),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
  };
  if (node.parentId === node.id) node.parentId = null;
  return node;
}

function isTree(doc) {
  if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.nodes)) return false;
  for (const n of doc.nodes) {
    if (typeof n !== 'object' || n === null) return false;
    if (typeof n.id !== 'string' || !ID_RE.test(n.id)) return false;
    if (n.parentId !== null && typeof n.parentId !== 'string') return false;
    if (typeof n.title !== 'string') return false;
    if (typeof n.status !== 'string' || !STATUS.includes(n.status)) return false;
  }
  return true;
}

function normalizeTree(doc) {
  if (!isTree(doc)) return null;
  const nodes = doc.nodes.map((n) => normalizeNode(n));
  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) return null;
    ids.add(node.id);
  }
  for (const node of nodes) {
    if (node.parentId !== null && !ids.has(node.parentId)) node.parentId = null;
  }
  const roots = nodes.filter((n) => n.parentId === null);
  if (roots.length > 1) {
    for (const extra of roots.slice(1)) extra.parentId = roots[0].id;
  }
  const events = Array.isArray(doc.events) ? doc.events.filter((e) => e && typeof e === 'object').map((e) => ({
    id: typeof e.id === 'string' ? e.id : 'e0',
    at: Number.isFinite(Number(e.at)) ? Number(e.at) : Date.now(),
    nodeId: typeof e.nodeId === 'string' ? e.nodeId : null,
    type: typeof e.type === 'string' ? e.type : 'update',
    from: typeof e.from === 'string' ? e.from : null,
    to: typeof e.to === 'string' ? e.to : null,
    note: typeof e.note === 'string' ? e.note.slice(0, 2000) : '',
    by: typeof e.by === 'string' ? e.by : '',
  })) : [];
  let eventSeq = Number.isFinite(Number(doc.eventSeq)) ? Math.max(1, Math.floor(Number(doc.eventSeq))) : 1;
  for (const e of events) {
    const m = /^e(\d+)$/.exec(e.id);
    if (m) eventSeq = Math.max(eventSeq, Number(m[1]) + 1);
  }
  let nodeSeq = Number.isFinite(Number(doc.nodeSeq)) ? Math.max(1, Math.floor(Number(doc.nodeSeq))) : 1;
  for (const node of nodes) {
    const m = /^n(\d+)$/.exec(node.id);
    if (m) nodeSeq = Math.max(nodeSeq, Number(m[1]) + 1);
  }
  return {
    version: SCHEMA_VERSION,
    name: typeof doc.name === 'string' ? doc.name.slice(0, 300) : '',
    description: typeof doc.description === 'string' ? doc.description.slice(0, 4000) : '',
    goal: typeof doc.goal === 'string' ? doc.goal.slice(0, 4000) : (typeof doc.description === 'string' ? doc.description.slice(0, 4000) : ''),
    sessionId: typeof doc.sessionId === 'string' ? doc.sessionId : '',
    createdAt: Number.isFinite(Number(doc.createdAt)) ? Number(doc.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(doc.updatedAt)) ? Number(doc.updatedAt) : Date.now(),
    currentNodeId: typeof doc.currentNodeId === 'string' ? doc.currentNodeId : null,
    nodeSeq,
    eventSeq,
    nodes,
    events,
  };
}

function emptyTree({ name, description, goal, sessionId }) {
  const now = Date.now();
  return {
    version: SCHEMA_VERSION,
    name: name ?? '',
    description: description ?? '',
    goal: goal ?? description ?? '',
    sessionId: sessionId ?? '',
    createdAt: now,
    updatedAt: now,
    currentNodeId: null,
    nodeSeq: 1,
    eventSeq: 1,
    nodes: [],
    events: [],
  };
}

function makeNode(id, parentId, title, status, extra = {}) {
  const now = Date.now();
  return {
    id,
    parentId,
    title,
    status,
    kind: KIND.includes(extra.kind) ? extra.kind : (parentId === null ? 'milestone' : 'task'),
    weight: Number.isFinite(Number(extra.weight)) ? Math.max(0, Number(extra.weight)) : 1,
    progress: extra.progress ?? '',
    note: extra.note ?? '',
    decision: extra.decision ?? '',
    implementation: extra.implementation ?? '',
    doneWhen: strArray(extra.doneWhen),
    verify: strArray(extra.verify),
    files: fileArray(extra.files) ?? [],
    links: linkArray(extra.links) ?? [],
    blockedBy: strArray(extra.blockedBy),
    parked: extra.parked === true || extra.kind === 'idea' ? extra.parked === true : false,
    blockedSince: status === 'blocked' ? now : null,
    evidence: [],
    owner: typeof extra.owner === 'string' ? extra.owner.slice(0, 120) : '',
    review: null,
    createdAt: now,
    updatedAt: now,
  };
}

function pushEvent(tree, { nodeId = null, type, from = null, to = null, note = '', by = '' }) {
  const event = { id: 'e' + tree.eventSeq, at: Date.now(), nodeId, type, from, to, note: String(note).slice(0, 2000), by };
  tree.eventSeq += 1;
  tree.events.push(event);
  if (tree.events.length > MAX_EVENTS) tree.events.splice(0, tree.events.length - MAX_EVENTS);
  return event;
}

function isCovered(node, item, index) {
  for (const evidence of node.evidence ?? []) {
    for (const cover of evidence.covers ?? []) {
      if (cover === '*' || cover === item || cover === String(index)) return true;
    }
  }
  return false;
}

function missingEvidence(node) {
  const doneWhen = node.doneWhen ?? [];
  if (!doneWhen.length) {
    return (node.evidence ?? []).length ? [] : ['至少一条证据（命令/测试/评审/文件，ref 必填）'];
  }
  return doneWhen.filter((item, index) => !isCovered(node, item, index));
}

function computeMetrics(tree) {
  const counts = {};
  for (const status of STATUS) counts[status] = 0;
  const live = tree.nodes.filter((n) => !n.parked);
  let weightTotal = 0;
  let weightClosed = 0;
  let doneWhenTotal = 0;
  let doneWhenCovered = 0;
  let closedNodes = 0;
  let closedWithEvidence = 0;
  for (const node of live) {
    counts[node.status] = (counts[node.status] ?? 0) + 1;
    const weight = Number.isFinite(Number(node.weight)) ? Number(node.weight) : 1;
    weightTotal += weight;
    if (node.status === 'closed') {
      weightClosed += weight;
      closedNodes += 1;
      if ((node.evidence ?? []).length) closedWithEvidence += 1;
    }
    for (let index = 0; index < (node.doneWhen ?? []).length; index += 1) {
      doneWhenTotal += 1;
      if (isCovered(node, node.doneWhen[index], index)) doneWhenCovered += 1;
    }
  }
  const now = Date.now();
  const blockedAging = live
    .filter((n) => n.status === 'blocked')
    .map((n) => ({
      id: n.id,
      title: n.title,
      days: n.blockedSince ? Math.max(0, Math.floor((now - n.blockedSince) / 86400000)) : 0,
    }))
    .sort((a, b) => b.days - a.days);
  let rework = 0;
  for (const event of tree.events ?? []) {
    if (event.type === 'status' && event.to === 'decided' && (event.from === 'implemented' || event.from === 'closed')) rework += 1;
  }
  return {
    total: live.length,
    counts,
    open: live.filter((n) => n.status !== 'closed').length,
    progress: weightTotal ? Math.round((weightClosed * 100) / weightTotal) : 0,
    weightTotal,
    weightClosed,
    pendingInterview: counts.pending_decision,
    inProgress: counts.in_progress,
    awaitingVerify: counts.implemented,
    awaitingReview: live.filter((n) => n.status === 'implemented' && (!n.review || n.review.verdict !== 'pass')).length,
    blocked: counts.blocked,
    closed: counts.closed,
    doneWhenTotal,
    doneWhenCovered,
    evidenceMissing: doneWhenTotal - doneWhenCovered,
    evidenceCoverage: doneWhenTotal
      ? Math.round((doneWhenCovered * 100) / doneWhenTotal)
      : closedNodes
        ? Math.round((closedWithEvidence * 100) / closedNodes)
        : 0,
    rework,
    blockedAging,
  };
}

function computeNext(tree) {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const closed = new Set(tree.nodes.filter((n) => n.status === 'closed').map((n) => n.id));
  const dependenciesReady = (node) => (node.blockedBy ?? []).every((id) => !byId.has(id) || closed.has(id));
  const ancestorsOpen = (node) => {
    let cur = node.parentId === null ? null : byId.get(node.parentId);
    const guard = new Set();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      if (cur.status === 'closed') return false;
      cur = cur.parentId === null ? null : byId.get(cur.parentId);
    }
    return true;
  };
  const todo = [];
  const questions = [];
  const doing = [];
  for (const { node, depth } of preorder(tree)) {
    if (node.parked) continue;
    const entry = {
      id: node.id,
      title: node.title,
      status: node.status,
      kind: node.kind,
      depth,
      parentId: node.parentId,
      doneWhen: (node.doneWhen ?? []).length,
      evidence: (node.evidence ?? []).length,
      blockedBy: (node.blockedBy ?? []).slice(),
    };
    if (node.status === 'in_progress') doing.push(entry);
    if (node.status !== 'todo' && node.status !== 'pending_decision') continue;
    if (!ancestorsOpen(node) || !dependenciesReady(node)) continue;
    if (node.status === 'pending_decision') questions.push(entry);
    else todo.push(entry);
  }
  return { todo, questions, doing };
}

function computeBlockers(tree) {
  const open = new Set(tree.nodes.filter((n) => n.status !== 'closed' && !n.parked).map((n) => n.id));
  const result = [];
  for (const node of tree.nodes) {
    if (node.parked) continue;
    const seen = new Set();
    const stack = [node.id];
    while (stack.length) {
      const current = stack.pop();
      for (const other of tree.nodes) {
        if (other.id === node.id || seen.has(other.id)) continue;
        if ((other.blockedBy ?? []).includes(current)) {
          seen.add(other.id);
          stack.push(other.id);
        }
      }
    }
    const unlocks = [...seen].filter((id) => open.has(id)).length;
    if (unlocks > 0) result.push({ id: node.id, title: node.title, unlocks });
  }
  return result.sort((a, b) => b.unlocks - a.unlocks || naturalCompare(a.id, b.id)).slice(0, 6);
}

function formatTime(at) {
  const d = new Date(Number(at) || 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function eventText(event) {
  const target = event.nodeId ?? '';
  if (event.type === 'status') return `${target} ${event.from ?? '?'} -> ${event.to ?? '?'}${event.note ? '（' + event.note + '）' : ''}`;
  if (event.type === 'evidence') return `${target} 证据 +1${event.note ? '：' + event.note : ''}`;
  if (event.type === 'create') return `新建 ${target}`;
  if (event.type === 'current') return `当前节点 -> ${event.to ?? target}`;
  return `${event.type} ${target}${event.note ? '：' + event.note : ''}`;
}

function briefText(tree, currentId) {
  const metrics = computeMetrics(tree);
  const next = computeNext(tree);
  const lines = [];
  lines.push('# ' + (tree.name || '任务树'));
  if (tree.goal || tree.description) lines.push('目标：' + (tree.goal || tree.description));
  lines.push(`进度：${metrics.progress}%（已闭权重 ${metrics.weightClosed}/${metrics.weightTotal}）`);
  lines.push(`统计：待拍 ${metrics.counts.pending_decision} · 进行中 ${metrics.counts.in_progress} · 待验 ${metrics.counts.implemented}（其中待评审 ${metrics.awaitingReview}） · 阻塞 ${metrics.counts.blocked} · 已闭 ${metrics.counts.closed}/${metrics.total}`);
  lines.push(`验收：${metrics.doneWhenCovered}/${metrics.doneWhenTotal} 项覆盖（${metrics.evidenceCoverage}%），返工 ${metrics.rework} 次`);
  const current = currentId ? findNode(tree, currentId) : null;
  if (current) lines.push('当前：' + breadcrumbOf(tree, current.id).map((n) => n.title).join(' / '));
  if (next.todo.length) {
    lines.push('下一步：');
    for (const item of next.todo.slice(0, 6)) lines.push(`- ${item.id} ${item.title}${item.doneWhen ? `（验收 ${item.doneWhen} 项）` : ''}`);
  } else {
    lines.push('下一步：' + (next.questions.length ? '先处理待拍问题（见下）' : '暂无依赖就绪的 todo'));
  }
  if (next.questions.length) {
    lines.push('待拍问题：');
    for (const item of next.questions.slice(0, 6)) lines.push(`- ${item.id} ${item.title}`);
  }
  const blocked = tree.nodes.filter((n) => n.status === 'blocked');
  if (blocked.length) {
    lines.push('阻塞：');
    for (const node of blocked.slice(0, 6)) {
      const days = node.blockedSince ? Math.max(0, Math.floor((Date.now() - node.blockedSince) / 86400000)) : 0;
      lines.push(`- ${node.id} ${node.title}${days ? `（${days} 天）` : ''}${node.note ? ' —— ' + String(node.note).split('\n')[0] : ''}`);
    }
  }
  const recent = tree.events.slice(-8).reverse();
  if (recent.length) {
    lines.push('最近事件：');
    for (const event of recent) lines.push(`- ${formatTime(event.at)} ${eventText(event)}`);
  }
  return lines.join('\n');
}

function renderTreeText(tree, currentId) {
  const lines = [];
  lines.push('主线：' + (tree.name || '(未命名)'));
  if (tree.goal || tree.description) lines.push('目标：' + (tree.goal || tree.description));
  const metrics = computeMetrics(tree);
  lines.push(`进度：${metrics.progress}%（${metrics.weightClosed}/${metrics.weightTotal} 权重）· 待拍 ${metrics.counts.pending_decision} · 待验 ${metrics.counts.implemented} · 阻塞 ${metrics.counts.blocked} · 已闭 ${metrics.counts.closed}/${metrics.total}`);
  for (const { node, depth } of preorder(tree)) {
    const status = STATUS_LABEL[node.status] ?? node.status;
    const mark = node.id === currentId ? '  ← 你在这' : '';
    const parked = node.parked ? '（停靠）' : '';
    const acceptance = (node.doneWhen ?? []).length ? ` 验收${(node.doneWhen ?? []).filter((d, i) => isCovered(node, d, i)).length}/${node.doneWhen.length}` : '';
    const files = (node.files ?? []).length ? ` ⌘${node.files.length}` : '';
    const blocked = (node.blockedBy ?? []).length ? ` 依赖:${node.blockedBy.join(',')}` : '';
    const kind = node.kind === 'task' ? '' : `〔${KIND_LABEL[node.kind] ?? node.kind}〕`;
    lines.push('  '.repeat(depth) + '- ' + node.id + ' ' + kind + node.title + ' [' + status + ']' + parked + acceptance + files + blocked + mark);
  }
  if (currentId) {
    const cur = findNode(tree, currentId);
    if (cur) lines.push('你在这：' + breadcrumbOf(tree, cur.id).map((n) => n.title).join(' / '));
  }
  return lines.join('\n');
}

async function atomicWriteText(file, content) {
  const tmp = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });
    await rename(tmp, file);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
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

function textOrNull(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

function normalizeIdText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

export function apply(ctx, config) {
  const resolved = {
    stateDir: config.stateDir ?? '.quest-tree',
    stateFile: config.stateFile ?? 'quest.json',
    stateRoot: config.stateRoot ?? '',
  };

  // v1.0: one tree per workspace (the map of the project), with a per-session
  // "you are here" overlay. Older releases stored one tree per session under the
  // global state root or the workspace; both remain read-only migration sources.
  function workspaceRoot(exec) {
    const cwd = exec?.agent?.session?.header?.cwd;
    if (typeof cwd === 'string' && cwd) return cwd;
    const ws = ctx.get(WS_KEYS[0]) ?? ctx.get(WS_KEYS[1]);
    if (ws) {
      try { const list = ws.list(); if (list && list.length) return list[0].path; } catch {}
    }
    return process.cwd();
  }

  function projectDir(exec) {
    return resolved.stateRoot ? resolve(resolved.stateRoot) : join(workspaceRoot(exec), resolved.stateDir);
  }

  function projectFile(exec) {
    return join(projectDir(exec), 'project.json');
  }

  function sessionIdOf(exec) {
    return exec?.agent?.id ?? exec?.agent?.session?.header?.sessionId ?? '';
  }

  function overlayFile(exec) {
    const sid = sessionIdOf(exec);
    if (!sid) return null;
    return join(projectDir(exec), 'sessions', safeFileStem(sid) + '.json');
  }

  function legacyGlobalFile(exec) {
    const sid = sessionIdOf(exec);
    if (!sid) return null;
    return join(homedir(), '.dsh', 'storages', 'dsh-questtree', 'sessions', safeFileStem(sid) + '.json');
  }

  function legacyWorkspaceSessionFile(exec) {
    const sid = sessionIdOf(exec);
    if (!sid) return null;
    return join(workspaceRoot(exec), resolved.stateDir, 'sessions', safeFileStem(sid) + '.json');
  }

  function legacySingleFile(exec) {
    return join(workspaceRoot(exec), resolved.stateDir, resolved.stateFile);
  }

  async function readTreeFile(file) {
    if (!file) return null;
    try {
      const doc = JSON.parse(await readFile(file, 'utf8'));
      return normalizeTree(doc);
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async function writeTree(file, tree) {
    tree.updatedAt = Date.now();
    await mkdir(dirname(file), { recursive: true });
    await atomicWriteText(file, JSON.stringify(tree, null, 2));
  }

  async function readOverlay(exec) {
    const file = overlayFile(exec);
    if (!file) return null;
    try {
      const doc = JSON.parse(await readFile(file, 'utf8'));
      if (!doc || typeof doc !== 'object') return null;
      return {
        sessionId: typeof doc.sessionId === 'string' ? doc.sessionId : '',
        currentNodeId: typeof doc.currentNodeId === 'string' ? doc.currentNodeId : null,
      };
    } catch {
      return null;
    }
  }

  async function writeOverlay(exec, currentNodeId) {
    const file = overlayFile(exec);
    if (!file) return;
    await mkdir(dirname(file), { recursive: true });
    await atomicWriteText(file, JSON.stringify({
      sessionId: sessionIdOf(exec),
      currentNodeId,
      updatedAt: Date.now(),
    }, null, 2));
  }

  async function currentNodeOf(exec, tree) {
    const overlay = await readOverlay(exec);
    if (overlay?.currentNodeId && findNode(tree, overlay.currentNodeId)) return overlay.currentNodeId;
    if (tree.currentNodeId && findNode(tree, tree.currentNodeId)) return tree.currentNodeId;
    return rootNode(tree)?.id ?? null;
  }

  // Load the workspace's tree; on first use adopt a tree written by an older
  // version (per-session store, workspace per-session file, single quest.json).
  async function loadTree(exec) {
    const target = projectFile(exec);
    const existing = await readTreeFile(target);
    if (existing) return existing;
    const candidates = [legacyGlobalFile(exec), legacyWorkspaceSessionFile(exec)];
    const sid = sessionIdOf(exec);
    for (const candidate of candidates) {
      const tree = await readTreeFile(candidate);
      if (!tree) continue;
      await writeTree(target, tree);
      if (sid) await writeOverlay(exec, tree.currentNodeId ?? rootNode(tree)?.id ?? null);
      pushEvent(tree, { nodeId: null, type: 'migrate', note: 'from ' + candidate, by: sid });
      await writeTree(target, tree);
      return tree;
    }
    const legacy = await readTreeFile(legacySingleFile(exec));
    if (legacy && (!sid || !legacy.sessionId || legacy.sessionId === sid)) {
      await writeTree(target, legacy);
      if (sid) await writeOverlay(exec, legacy.currentNodeId ?? rootNode(legacy)?.id ?? null);
      pushEvent(legacy, { nodeId: null, type: 'migrate', note: 'from ' + legacySingleFile(exec), by: sid });
      await writeTree(target, legacy);
      return legacy;
    }
    return null;
  }

  async function requireTree(exec) {
    const tree = await loadTree(exec);
    if (!tree) throw new Error('还没有任务树，先 quest_tree_create 或 quest_tree_plan');
    return tree;
  }

  function requireNode(tree, id) {
    const node = findNode(tree, id);
    if (!node) throw new Error('节点不存在：' + id);
    return node;
  }

  function assertNoDependencyCycle(tree, nodeId, blockedBy) {
    const byId = new Map(tree.nodes.map((n) => [n.id, n]));
    const stack = [...blockedBy];
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (id === nodeId) throw new Error('依赖成环：' + nodeId + ' 不能直接或间接依赖自己');
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (node) stack.push(...(node.blockedBy ?? []));
    }
  }

  function assertWip(tree, nodeId) {
    const active = tree.nodes.filter((n) => n.status === 'in_progress' && n.id !== nodeId && !n.parked && n.parentId !== null);
    if (active.length >= WIP_LIMIT) {
      throw new Error(`进行中节点已有 ${active.length} 个（上限 ${WIP_LIMIT}）：${active.map((n) => n.id).join(', ')}；先收尾或传 force: true`);
    }
  }

  function applyUpdate(node, args, tree, by) {
    if (args.title !== undefined) node.title = String(args.title).slice(0, 300);
    if (args.progress !== undefined) node.progress = textOrNull(args.progress, 2000) ?? '';
    if (args.note !== undefined) node.note = textOrNull(args.note) ?? '';
    if (args.decision !== undefined) node.decision = textOrNull(args.decision) ?? '';
    if (args.implementation !== undefined) node.implementation = textOrNull(args.implementation) ?? '';
    if (args.kind !== undefined) {
      if (!KIND.includes(args.kind)) throw new Error('kind 必须是 ' + KIND.join('/'));
      node.kind = args.kind;
    }
    if (args.doneWhen !== undefined) node.doneWhen = strArray(args.doneWhen);
    if (args.verify !== undefined) node.verify = strArray(args.verify);
    if (args.blockedBy !== undefined) {
      const blockedBy = strArray(args.blockedBy);
      for (const id of blockedBy) {
        if (id === node.id) throw new Error('节点不能依赖自己');
        if (!findNode(tree, id)) throw new Error('依赖节点不存在：' + id);
      }
      assertNoDependencyCycle(tree, node.id, blockedBy);
      node.blockedBy = blockedBy;
    }
    if (args.weight !== undefined) {
      const weight = Number(args.weight);
      if (!Number.isFinite(weight) || weight < 0) throw new Error('weight 必须是非负数字');
      node.weight = weight;
    }
    if (args.parked !== undefined) node.parked = args.parked === true;
    if (args.owner !== undefined) node.owner = textOrNull(args.owner, 120) ?? '';
    if (args.files !== undefined) {
      const files = fileArray(args.files);
      if (!files) throw new Error('files 必须是 [{path, line?, endLine?}] 或 "path:line" 字符串数组');
      node.files = files;
    }
    if (args.links !== undefined) {
      const links = linkArray(args.links);
      if (!links) throw new Error('links 必须是 [{kind, ref, label?}] 或 "kind:ref" 字符串数组，kind ∈ ' + LINK_KINDS.join('/'));
      node.links = links;
    }
    if (args.status !== undefined) {
      if (!STATUS.includes(args.status)) throw new Error('status 必须是 ' + STATUS.join('/'));
      setStatus(tree, node, args.status, { by, note: args.note, force: args.force === true });
    }
    node.updatedAt = Date.now();
  }

  function setStatus(tree, node, next, options) {
    const prev = node.status;
    if (prev === next) return;
    if (next === 'in_progress' && !options.force) assertWip(tree, node.id);
    if (next === 'implemented' && !(node.files ?? []).length && !(node.links ?? []).length) {
      throw new Error('标为 implemented（已实施）前需要至少一个 files 或 links，指向真实改动；用 force: true 可跳过');
    }
    if (next === 'closed' && !options.force) {
      const missing = missingEvidence(node);
      if (missing.length) {
        throw new Error('关闭节点前需要证据覆盖全部验收项，缺：' + missing.join('；') + '。用 quest_tree_evidence 补证据，或 force: true 跳过（会记录 forced）');
      }
      if (!node.review || node.review.verdict !== 'pass') {
        throw new Error('关闭节点前需要通过评审：先复核 implemented 节点（子 agent / 队友 / 自己按验收项核对），再调 quest_tree_review({node_id, verdict: "pass", note})；或 force: true 跳过（会记录 forced）');
      }
    }
    node.status = next;
    if (next === 'blocked') {
      if (!node.blockedSince) node.blockedSince = Date.now();
    } else {
      node.blockedSince = null;
    }
    pushEvent(tree, {
      nodeId: node.id,
      type: 'status',
      from: prev,
      to: next,
      note: options.force ? 'forced' : (options.note ? String(options.note).slice(0, 300) : ''),
      by: options.by,
    });
  }

  function createNode(tree, { id, parentId, title, status, extra }) {
    const parent = parentId === null ? null : requireNode(tree, parentId);
    const finalParent = parent ? parent.id : null;
    let finalId = id ? String(id) : null;
    if (finalId) {
      if (!ID_RE.test(finalId)) throw new Error('id 只能含字母/数字/._-，且以字母数字开头：' + finalId);
      if (findNode(tree, finalId)) throw new Error('id 已存在：' + finalId);
    } else {
      while (findNode(tree, 'n' + tree.nodeSeq)) tree.nodeSeq += 1;
      finalId = 'n' + tree.nodeSeq;
      tree.nodeSeq += 1;
    }
    const node = makeNode(finalId, finalParent, String(title).slice(0, 300), status ?? 'todo', extra ?? {});
    tree.nodes.push(node);
    pushEvent(tree, { nodeId: node.id, type: 'create', note: node.title, by: extra?.by ?? '' });
    return node;
  }

  ctx.systemPrompt.section({ name: 'quest-tree:usage', order: config.promptSectionOrder ?? 118, text: USAGE_SECTION });

  // ---- quest_tree_create ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_create',
    description: '新建一棵任务树（主线根节点 + 目标），之后用 quest_tree_plan 或 quest_tree_create_node 铺分支。整棵项目树按 workspace 共享，各会话只记录自己的「你在这」。',
    parameters: {
      name: { type: 'string', required: true, description: '主线任务标题' },
      description: { type: 'string', description: '总目标（可选，会写入 goal）' },
      goal: { type: 'string', description: '一行目标（可选；默认取 description）' },
      overwrite: { type: 'boolean', description: '已存在树时是否覆盖；默认 false（存在则报错）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'quest tree created: ' + (args.name ?? '') + ' -> ' + value.path }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const existing = await loadTree(exec);
        if (existing && !args.overwrite) {
          throw new Error('任务树已存在；如需覆盖请传 overwrite: true，或先 quest_tree_read 查看现有树再改');
        }
        const by = sessionIdOf(exec);
        const tree = emptyTree({ name: args.name, description: args.description, goal: args.goal, sessionId: by });
        const root = makeNode('root', null, String(args.name).slice(0, 300), 'in_progress', { kind: 'milestone', notes: '' });
        tree.nodes.push(root);
        tree.currentNodeId = 'root';
        pushEvent(tree, { nodeId: 'root', type: 'create', note: 'root', by });
        await writeTree(target, tree);
        if (by) await writeOverlay(exec, 'root');
        return { ok: true, path: target, node_id: 'root', view: { currentNodeId: 'root' } };
      });
    },
  }));

  // ---- quest_tree_plan ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_plan',
    description: '一次铺开整棵树：传 nodes 数组（按父在前、子在后的顺序）批量建分支，每个任务带 doneWhen 验收项与 verify 命令。已存在树时在其中追加；不存在则自动建树。',
    parameters: {
      name: { type: 'string', description: '建树时的主线标题（树已存在时忽略）' },
      description: { type: 'string', description: '总目标（建树时写入 goal）' },
      overwrite: { type: 'boolean', description: '树已存在时是否覆盖；默认 false（追加）' },
      nodes: {
        type: 'json',
        required: true,
        description: '节点数组：[{id?, title, parentId?（默认 root）, kind?, status?, weight?, note?, doneWhen?: string[], verify?: string[], decision?, implementation?, blockedBy?: string[]}]',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'planned ' + value.created.length + ' node(s): ' + value.created.map((n) => n.id).join(', ') }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const by = sessionIdOf(exec);
        const spec = args.nodes;
        if (!Array.isArray(spec) || !spec.length) throw new Error('nodes 必须是非空数组');
        let tree = await loadTree(exec);
        if (tree && args.overwrite) {
          tree = emptyTree({ name: args.name ?? tree.name, description: args.description ?? tree.description, goal: args.description ?? tree.goal, sessionId: by });
          tree.nodes.push(makeNode('root', null, String(args.name ?? tree.name ?? '主线').slice(0, 300), 'in_progress', { kind: 'milestone' }));
        }
        if (!tree) {
          tree = emptyTree({ name: args.name ?? '主线', description: args.description, sessionId: by });
          tree.nodes.push(makeNode('root', null, String(args.name ?? '主线').slice(0, 300), 'in_progress', { kind: 'milestone' }));
          pushEvent(tree, { nodeId: 'root', type: 'create', note: 'root', by });
        }
        const created = [];
        for (const raw of spec) {
          if (!raw || typeof raw !== 'object') throw new Error('nodes 里每一项必须是对象');
          const title = typeof raw.title === 'string' ? raw.title.trim() : '';
          if (!title) throw new Error('每个节点都需要 title');
          const parentId = raw.parentId === undefined || raw.parentId === null || raw.parentId === '' ? 'root' : String(raw.parentId);
          const node = createNode(tree, {
            id: raw.id,
            parentId,
            title,
            status: raw.status && STATUS.includes(raw.status) ? raw.status : 'todo',
            extra: {
              kind: raw.kind,
              weight: raw.weight,
              note: raw.note,
              decision: raw.decision,
              implementation: raw.implementation,
              doneWhen: raw.doneWhen,
              verify: raw.verify,
              blockedBy: raw.blockedBy,
              owner: raw.owner,
              by,
            },
          });
          created.push({ id: node.id, parentId: node.parentId });
        }
        if (!tree.currentNodeId) tree.currentNodeId = 'root';
        await writeTree(target, tree);
        if (by) await writeOverlay(exec, tree.currentNodeId);
        return { ok: true, path: target, created, view: { currentNodeId: tree.currentNodeId } };
      });
    },
  }));

  // ---- quest_tree_create_node ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_create_node',
    description: '新建一个分支节点，挂到指定父节点下（主线根由 quest_tree_create 建立）。任务节点请带 doneWhen 验收项。',
    parameters: {
      title: { type: 'string', required: true, description: '节点标题' },
      parent_id: { type: 'string', description: '父节点 id；省略默认 "root"' },
      id: { type: 'string', description: '自定义节点 id（如 P1、P4.3），须匹配 [A-Za-z0-9][A-Za-z0-9._-]*；省略则自动 n<序号>' },
      status: { type: 'string', enum: STATUS, description: '七档状态；默认 todo' },
      kind: { type: 'string', enum: KIND, description: '节点类型：milestone/task/question/idea/step；默认 task' },
      weight: { type: 'number', description: '进度权重；默认 1' },
      doneWhen: { type: 'json', description: '验收项数组（字符串），关闭前必须有证据覆盖' },
      verify: { type: 'json', description: '验证命令数组（字符串）' },
      blockedBy: { type: 'json', description: '依赖节点 id 数组（这些节点 closed 后本节点才进入 next）' },
      note: { type: 'string', description: 'markdown 备注（问题背景、证据、权衡）' },
      decision: { type: 'string', description: 'markdown 决策记录：拍板结论、理由、被否选项' },
      implementation: { type: 'string', description: 'markdown 实施 preview：改动文件与接口、行为、验证命令与结果' },
      owner: { type: 'string', description: '负责人：队友 / AgentTeams 成员名（可选）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'node ' + value.id + ' created under ' + value.parent_id }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const by = sessionIdOf(exec);
        const status = args.status ?? 'todo';
        if (!STATUS.includes(status)) throw new Error('status 必须是 ' + STATUS.join('/'));
        const node = createNode(tree, {
          id: args.id,
          parentId: args.parent_id ?? 'root',
          title: args.title,
          status,
          extra: {
            kind: args.kind,
            weight: args.weight,
            doneWhen: args.doneWhen,
            verify: args.verify,
            blockedBy: args.blockedBy,
            note: args.note,
            decision: args.decision,
            implementation: args.implementation,
            owner: args.owner,
            by,
          },
        });
        if (!tree.currentNodeId) tree.currentNodeId = node.id;
        await writeTree(target, tree);
        return { id: node.id, parent_id: node.parentId };
      });
    },
  }));

  // ---- quest_tree_update_node ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_update_node',
    description: '更新节点的标题、状态、进度、备注、决策、实施 preview、验收项、验证命令、改动文件、链接、依赖、负责人或权重；一次可改多项。实现后请填 files/links 并标 implemented；关闭前先补证据并通过评审。',
    parameters: {
      node_id: { type: 'string', required: true, description: '目标节点 id' },
      title: { type: 'string', description: '新标题' },
      status: { type: 'string', enum: STATUS, description: '七档状态' },
      progress: { type: 'string', description: '进度自由文本' },
      note: { type: 'string', description: 'markdown 备注（问题背景、证据、权衡）' },
      decision: { type: 'string', description: 'markdown 决策记录：拍板结论、理由、被否选项' },
      implementation: { type: 'string', description: 'markdown 实施 preview：改动文件与接口、行为、验证命令与结果' },
      doneWhen: { type: 'json', description: '验收项数组（字符串）' },
      verify: { type: 'json', description: '验证命令数组（字符串）' },
      files: { type: 'json', description: '改动文件数组：[{path, line?, endLine?}] 或 "path:line"' },
      links: { type: 'json', description: '关联链接数组：[{kind: agent-teams|commit|pr|issue|session|doc|url, ref, label?}]' },
      blockedBy: { type: 'json', description: '依赖节点 id 数组（整体替换）' },
      kind: { type: 'string', enum: KIND, description: '节点类型' },
      weight: { type: 'number', description: '进度权重（非负）' },
      parked: { type: 'boolean', description: '是否停靠（停靠节点不进入 next/进度）' },
      owner: { type: 'string', description: '负责人：队友 / AgentTeams 成员名' },
      force: { type: 'boolean', description: '跳过 WIP/证据/评审/改动校验（会记录 forced 事件）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'node ' + value.id + ' updated' }],
    },
    async execute(args, exec) {
      const fields = ['title', 'status', 'progress', 'note', 'decision', 'implementation', 'doneWhen', 'verify', 'files', 'links', 'blockedBy', 'kind', 'weight', 'parked', 'owner', 'force'];
      if (!fields.some((field) => args[field] !== undefined)) {
        throw new Error('至少提供一个要更新的字段：' + fields.join('/'));
      }
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const node = requireNode(tree, args.node_id);
        applyUpdate(node, args, tree, sessionIdOf(exec));
        await writeTree(target, tree);
        const missing = node.status === 'closed' ? missingEvidence(node) : [];
        return { id: node.id, status: node.status, missing };
      });
    },
  }));

  // ---- quest_tree_evidence ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_evidence',
    description: '给节点添加一条完成证据（测试/命令/diff/文件/评审/人工），covers 指定覆盖的验收项；close: true 时若全部验收项已覆盖则自动关闭。',
    parameters: {
      node_id: { type: 'string', required: true, description: '目标节点 id' },
      ref: { type: 'string', required: true, description: '证据引用：命令+结果摘要、测试名、diff/commit、文件:行、评审意见或链接' },
      kind: { type: 'string', enum: EVIDENCE_KINDS, description: '证据类型；默认 manual' },
      note: { type: 'string', description: '补充说明（实际输出、退出码等）' },
      covers: { type: 'json', description: '覆盖的验收项：doneWhen 文本或序号数组；"*" 表示全部覆盖' },
      close: { type: 'boolean', description: '全部验收项被覆盖时自动关闭节点' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'evidence ' + value.evidence_id + ' added to ' + args.node_id + (value.closed ? '（已关闭）' : '') }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const node = requireNode(tree, args.node_id);
        const by = sessionIdOf(exec);
        const covers = strArray(args.covers);
        const evidence = {
          id: 'ev' + (node.evidence.length + 1) + '-' + Math.random().toString(36).slice(2, 6),
          kind: EVIDENCE_KINDS.includes(args.kind) ? args.kind : 'manual',
          ref: String(args.ref).slice(0, 4000),
          note: textOrNull(args.note, 4000) ?? '',
          covers,
          at: Date.now(),
          by,
        };
        node.evidence.push(evidence);
        node.updatedAt = Date.now();
        pushEvent(tree, { nodeId: node.id, type: 'evidence', from: null, to: String(covers.length), note: String(args.ref).slice(0, 200), by });
        let closed = false;
        const missing = missingEvidence(node);
        if (args.close === true && !missing.length && node.status !== 'closed') {
          setStatus(tree, node, 'closed', { by, note: '', force: false });
          closed = true;
        }
        await writeTree(target, tree);
        return { evidence_id: evidence.id, closed, missing };
      });
    },
  }));

  // ---- quest_tree_review ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_review',
    description: '记录一次评审：implemented 节点复核通过（verdict: pass）后才能关闭；needs_revision 会把节点退回进行中。评审前先按 doneWhen 与 verify 核对证据、diff 和实际输出。',
    parameters: {
      node_id: { type: 'string', required: true, description: '要评审的 implemented 节点 id' },
      verdict: { type: 'string', required: true, enum: REVIEW_VERDICTS, description: 'pass 通过 / needs_revision 退回修改' },
      note: { type: 'string', description: '评审意见：核对了哪些验收项、发现什么问题、遗留风险' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'review ' + value.node_id + ' -> ' + value.verdict + (value.status ? '（' + value.status + '）' : '') }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const node = requireNode(tree, args.node_id);
        if (!REVIEW_VERDICTS.includes(args.verdict)) throw new Error('verdict 必须是 ' + REVIEW_VERDICTS.join('/'));
        if (node.status !== 'implemented') {
          throw new Error('只有 implemented（已实施、待验收）的节点可以评审；当前状态：' + node.status);
        }
        const by = sessionIdOf(exec);
        node.review = { verdict: args.verdict, note: textOrNull(args.note, 4000) ?? '', by, at: Date.now() };
        node.updatedAt = Date.now();
        pushEvent(tree, { nodeId: node.id, type: 'review', from: node.status, to: args.verdict, note: node.review.note, by });
        if (args.verdict === 'needs_revision') {
          setStatus(tree, node, 'in_progress', { by, note: 'review: needs_revision', force: true });
        }
        await writeTree(target, tree);
        return { ok: true, node_id: node.id, verdict: node.review.verdict, status: node.status };
      });
    },
  }));

  // ---- quest_tree_park ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_park',
    description: '停靠一个临时跑出来的想法/支线：在根下建一个 parked 的 idea 节点，不占 next 和进度；主线不被打断，之后可 update_node 取消 parked 或 move_node 归位。',
    parameters: {
      title: { type: 'string', required: true, description: '停靠的支线/想法标题' },
      note: { type: 'string', description: '为什么停靠、来源（用户这句需求/新发现）' },
      parent_id: { type: 'string', description: '挂到哪个节点下；默认 root' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'parked ' + value.id + ' under ' + value.parent_id }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const by = sessionIdOf(exec);
        const node = createNode(tree, {
          parentId: args.parent_id ?? 'root',
          title: args.title,
          status: 'todo',
          extra: { kind: 'idea', weight: 0, note: args.note, parked: true, by },
        });
        await writeTree(target, tree);
        return { id: node.id, parent_id: node.parentId };
      });
    },
  }));

  // ---- quest_tree_set_current ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_set_current',
    description: '把当前会话的「你在这」标记移到指定节点（只影响本会话，项目树是共享的）。',
    parameters: {
      node_id: { type: 'string', required: true, description: '要标记为「你在这」的节点 id' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: '你在这 -> ' + value.current_node_id }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const node = requireNode(tree, args.node_id);
        tree.currentNodeId = node.id;
        pushEvent(tree, { nodeId: node.id, type: 'current', from: null, to: node.id, by: sessionIdOf(exec) });
        await writeTree(target, tree);
        await writeOverlay(exec, node.id);
        return { current_node_id: node.id };
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
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'node ' + value.id + ' moved under ' + value.parent_id }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const node = requireNode(tree, args.node_id);
        if (node.parentId === null) throw new Error('根节点（主线）不能移动');
        if (args.node_id === args.new_parent_id) throw new Error('不能把节点移到它自己下面');
        const parent = requireNode(tree, args.new_parent_id);
        if (descendantIds(tree, args.node_id).has(parent.id)) throw new Error('不能把节点移到它自己的子节点下面');
        const from = node.parentId;
        node.parentId = parent.id;
        node.updatedAt = Date.now();
        pushEvent(tree, { nodeId: node.id, type: 'move', from, to: parent.id, by: sessionIdOf(exec) });
        await writeTree(target, tree);
        return { id: node.id, parent_id: node.parentId };
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
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: 'deleted ' + value.deleted + ' node(s)' }],
    },
    async execute(args, exec) {
      const target = projectFile(exec);
      return withLock(target, async () => {
        const tree = await requireTree(exec);
        const node = requireNode(tree, args.node_id);
        if (node.parentId === null) throw new Error('根节点（主线）不能删除');
        const doomed = descendantIds(tree, args.node_id);
        doomed.add(args.node_id);
        tree.nodes = tree.nodes.filter((n) => !doomed.has(n.id));
        pushEvent(tree, { nodeId: node.id, type: 'delete', note: 'removed ' + doomed.size + ' node(s)', by: sessionIdOf(exec) });
        const overlay = await readOverlay(exec);
        if ((overlay?.currentNodeId && doomed.has(overlay.currentNodeId)) || (tree.currentNodeId && doomed.has(tree.currentNodeId))) {
          const fallback = rootNode(tree)?.id ?? null;
          tree.currentNodeId = fallback;
          await writeOverlay(exec, fallback);
        }
        await writeTree(target, tree);
        return { deleted: doomed.size };
      });
    },
  }));

  // ---- quest_tree_read ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_read',
    description: '读取整棵任务树：节点（状态/验收/证据/改动文件）、当前节点、进度指标、下一步（依赖就绪的 todo）、待拍问题、阻塞与解锁收益、简报。每轮开工先读它来定锚。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: value.brief || renderTreeText(value, value.view?.currentNodeId) }],
    },
    async execute(args, exec) {
      const tree = await loadTree(exec);
      if (!tree) {
        return { version: SCHEMA_VERSION, name: '', goal: '', description: '', nodes: [], events: [], currentNodeId: null, nodeSeq: 1, eventSeq: 1, view: { currentNodeId: null }, metrics: computeMetrics({ nodes: [], events: [] }), next: { todo: [], questions: [], doing: [] }, blockers: [], brief: '暂无任务树。' };
      }
      const currentNodeId = await currentNodeOf(exec, tree);
      return {
        ...tree,
        view: { currentNodeId },
        metrics: computeMetrics(tree),
        next: computeNext(tree),
        blockers: computeBlockers(tree),
        brief: briefText(tree, currentNodeId),
      };
    },
  }));

  // ---- quest_tree_handoff ----
  ctx.tools.register(defineTool({
    name: 'quest_tree_handoff',
    description: '生成交接简报（markdown）：目标、进度、当前分支、剩余验收、证据缺口、下一步、待拍问题、阻塞与最近事件；用于新会话、队友或状态汇报。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: value.markdown }],
    },
    async execute(args, exec) {
      const tree = await requireTree(exec);
      const currentNodeId = await currentNodeOf(exec, tree);
      return { markdown: briefText(tree, currentNodeId), currentNodeId, path: projectFile(exec) };
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
          if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
          let sessionId = '';
          let cwdParam = '';
          try {
            const url = new URL(req.url ?? '/plugins/quest-tree/state', 'http://localhost');
            sessionId = url.searchParams.get('session') || '';
            cwdParam = url.searchParams.get('cwd') || '';
          } catch {}
          const root = cwdParam && isAbsolute(cwdParam)
            ? resolve(cwdParam)
            : (ws.list()[0]?.path ?? process.cwd());
          const exec = { agent: { id: sessionId, session: { header: { sessionId, cwd: root } } } };
          const tree = await loadTree(exec);
          if (!tree) {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            res.end(JSON.stringify({ ok: true, tree: null, view: { currentNodeId: null }, metrics: computeMetrics({ nodes: [], events: [] }), next: { todo: [], questions: [], doing: [] }, blockers: [], brief: '', path: projectFile(exec) }));
            return;
          }
          const currentNodeId = await currentNodeOf(exec, tree);
          const payload = {
            ok: true,
            tree,
            view: { currentNodeId },
            metrics: computeMetrics(tree),
            next: computeNext(tree),
            blockers: computeBlockers(tree),
            brief: briefText(tree, currentNodeId),
            path: projectFile(exec),
          };
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify(payload));
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

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => locks.clear(), 'quest-tree: locks');
  }
}
