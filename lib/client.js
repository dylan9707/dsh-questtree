window.__ModuleLoader__.load({
	id: 'dsh-questtree',
	factory(require) {
		'use strict';

		var React = require('react');
		var h = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;
		var useMemo = React.useMemo;

		var TAB_ID = 'dsh-questtree/panel';
		var TAB_KIND = 'dsh-questtree';

		var STATUS = ['todo', 'in_progress', 'closed', 'decided', 'implemented', 'pending_decision', 'blocked'];
		var STATUS_LABEL = {
			todo: '待办',
			in_progress: '进行中',
			closed: '已闭',
			decided: '已拍·未实施',
			implemented: '已拍·已实施',
			pending_decision: '待拍',
			blocked: '阻塞',
		};
		var STATUS_COLOR = {
			todo: '#62758a',
			in_progress: '#4d9fff',
			closed: '#3fb950',
			decided: '#d29922',
			implemented: '#39c5cf',
			pending_decision: '#a371f7',
			blocked: '#f85149',
		};
		var BOARD_ORDER = ['pending_decision', 'in_progress', 'implemented', 'blocked', 'decided', 'todo', 'closed'];
		var KIND_LABEL = { milestone: '里程碑', task: '任务', question: '问题', idea: '想法', step: '步骤' };
		var EVIDENCE_LABEL = { test: '测试', command: '命令', diff: 'diff', file: '文件', review: '评审', manual: '人工', link: '链接' };
		var LINK_LABEL = { 'agent-teams': 'AgentTeams', commit: 'commit', pr: 'PR', issue: 'issue', session: '会话', doc: '文档', url: '链接' };

		var CSS = [
			'.qt-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#0b1d33);color:var(--dsw-alias-label-primary,#e6edf3);font:12.5px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}',
			'.qt-root *{box-sizing:border-box}',
			'.qt-head{display:flex;align-items:center;gap:8px;padding:10px 12px 4px;flex:none}',
			'.qt-htitle{font-size:13px;font-weight:650;letter-spacing:.01em;white-space:nowrap}',
			'.qt-hmeta{color:var(--dsw-alias-label-secondary,#9fb3c8);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
			'.qt-spacer{flex:1;min-width:4px}',
			'.qt-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#3d5370);background:transparent;color:var(--dsw-alias-label-secondary,#9fb3c8);border-radius:999px;font:inherit;font-size:11px;line-height:18px;padding:0 9px;white-space:nowrap}',
			'.qt-btn:hover{color:var(--dsw-alias-label-primary,#e6edf3);background:color-mix(in srgb,var(--dsw-alias-border-l1,#2a3d54) 55%,transparent)}',
			'.qt-btn.on{color:var(--dsw-alias-label-primary,#e6edf3);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 12%,transparent)}',
			'.qt-goal{margin:2px 10px 8px;border:1px solid var(--dsw-alias-border-l1,#2a3d54);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#10263f);padding:8px 10px;flex:none}',
			'.qt-goalline{display:flex;gap:6px;align-items:baseline;font-size:12px}',
			'.qt-goalkey{color:var(--dsw-alias-label-secondary,#9fb3c8);flex:none;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase}',
			'.qt-goaltext{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.qt-bar{height:4px;border-radius:999px;background:var(--dsw-alias-border-l1,#2a3d54);overflow:hidden;margin:7px 0 6px}',
			'.qt-bar>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary,#4d9fff);transition:width .25s ease}',
			'.qt-chips{display:flex;flex-wrap:wrap;gap:4px;align-items:center}',
			'.qt-chip{display:inline-flex;align-items:center;gap:4px;padding:0 7px;height:18px;border-radius:999px;font-size:10.5px;line-height:16px;border:1px solid color-mix(in srgb,var(--st,#62758a) 45%,transparent);color:var(--st,#62758a);background:color-mix(in srgb,var(--st,#62758a) 10%,transparent);white-space:nowrap}',
			'.qt-chip.plain{--st:var(--dsw-alias-label-secondary,#9fb3c8);border-color:var(--dsw-alias-border-l1,#2a3d54);background:transparent}',
			'.qt-crumb{display:flex;align-items:center;gap:4px;padding:0 12px 6px;color:var(--dsw-alias-label-secondary,#9fb3c8);font-size:11px;overflow-x:auto;white-space:nowrap;flex:none}',
			'.qt-crumb b{color:var(--dsw-alias-label-primary,#e6edf3);font-weight:600}',
			'.qt-alert{margin:0 12px 6px;font-size:11px;display:flex;flex-wrap:wrap;gap:6px;flex:none}',
			'.qt-alert span{padding:1px 7px;border-radius:999px;background:color-mix(in srgb,currentColor 12%,transparent);border:1px solid color-mix(in srgb,currentColor 40%,transparent)}',
			'.qt-tools{display:flex;align-items:center;gap:6px;padding:0 10px 6px;flex:none;flex-wrap:wrap}',
			'.qt-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l1,#2a3d54);border-radius:999px;padding:1px;gap:1px}',
			'.qt-seg button{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#9fb3c8);font:inherit;font-size:11px;line-height:18px;padding:0 9px;border-radius:999px}',
			'.qt-seg button.on{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 18%,transparent);color:var(--dsw-alias-label-primary,#e6edf3)}',
			'.qt-search{flex:1;min-width:90px;background:transparent;border:1px solid var(--dsw-alias-border-l1,#2a3d54);border-radius:999px;color:inherit;font:inherit;font-size:11px;line-height:20px;padding:0 10px;outline:none}',
			'.qt-search::placeholder{color:color-mix(in srgb,var(--dsw-alias-label-secondary,#9fb3c8) 70%,transparent)}',
			'.qt-search:focus{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 60%,transparent)}',
			'.qt-body{flex:1;min-height:0;display:flex;flex-direction:column}',
			'.qt-rows{flex:1;min-height:0;overflow:auto;padding:2px 0 6px}',
			'.qt-row{display:flex;align-items:center;gap:6px;padding:3px 10px;min-height:26px;cursor:pointer;position:relative;--st:#62758a}',
			'.qt-row:hover{background:color-mix(in srgb,var(--dsw-alias-border-l1,#2a3d54) 35%,transparent)}',
			'.qt-row.here{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 12%,transparent);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary,#4d9fff)}',
			'.qt-row.sel{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 9%,transparent)}',
			'.qt-row.parked{opacity:.62}',
			'.qt-caret{width:12px;flex:none;color:var(--dsw-alias-label-secondary,#9fb3c8);text-align:center;user-select:none;font-size:10px}',
			'.qt-caret.hidden{visibility:hidden}',
			'.qt-dot{width:8px;height:8px;border-radius:50%;background:var(--st,#62758a);flex:none;box-shadow:0 0 0 2px color-mix(in srgb,var(--st,#62758a) 18%,transparent)}',
			'.qt-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.qt-title:hover{text-decoration:underline;text-underline-offset:2px}',
			'.qt-kind{flex:none;color:var(--dsw-alias-label-secondary,#9fb3c8);font-size:10px;border:1px solid var(--dsw-alias-border-l1,#2a3d54);border-radius:4px;padding:0 4px;line-height:14px}',
			'.qt-pill{flex:none;font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary,#9fb3c8);border:1px solid var(--dsw-alias-border-l1,#2a3d54);border-radius:999px;padding:0 5px;white-space:nowrap}',
			'.qt-pill.warn{color:#d29922;border-color:color-mix(in srgb,#d29922 45%,transparent)}',
			'.qt-pill.ok{color:#3fb950;border-color:color-mix(in srgb,#3fb950 45%,transparent)}',
			'.qt-here{flex:none;font-size:9.5px;font-weight:700;line-height:15px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-brand-primary,#4d9fff);color:#fff}',
			'.qt-detail{margin:2px 8px 8px;border-left:2px solid var(--st,#3d5370);background:var(--dsw-alias-bg-layer-1,#10263f);border-radius:0 8px 8px 0;padding:8px 10px;overflow:auto;max-height:46vh}',
			'.qt-dhead{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px}',
			'.qt-did{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-secondary,#9fb3c8)}',
			'.qt-sec+.qt-sec{margin-top:9px}',
			'.qt-sech{font-size:10px;letter-spacing:.06em;color:var(--dsw-alias-label-secondary,#9fb3c8);font-weight:650;margin-bottom:3px;text-transform:uppercase}',
			'.qt-secb{font-size:12px;overflow-wrap:anywhere}',
			'.qt-secb p{margin:3px 0}',
			'.qt-secb ul{margin:3px 0;padding-left:16px}',
			'.qt-secb a{color:var(--dsw-alias-brand-primary,#4d9fff)}',
			'.qt-code{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;background:color-mix(in srgb,var(--dsw-alias-border-l1,#2a3d54) 60%,transparent);padding:1px 4px;border-radius:4px;overflow-wrap:anywhere}',
			'.qt-pre{margin:4px 0;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-border-l1,#2a3d54) 45%,transparent);overflow:auto;font-size:10.5px}',
			'.qt-mdh{font-size:12px;font-weight:650;margin:6px 0 2px}',
			'.qt-check{display:flex;gap:6px;align-items:flex-start;padding:1px 0;font-size:11.5px}',
			'.qt-check i{flex:none;font-style:normal;width:12px;text-align:center;color:var(--dsw-alias-label-secondary,#9fb3c8)}',
			'.qt-check.done i{color:#3fb950}',
			'.qt-files{display:flex;flex-wrap:wrap;gap:4px}',
			'.qt-file{cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-family:ui-monospace,Consolas,monospace;font-size:10.5px;line-height:18px;padding:0 6px;border-radius:5px;border:1px solid var(--dsw-alias-border-l1,#2a3d54);background:color-mix(in srgb,var(--dsw-alias-border-l1,#2a3d54) 35%,transparent);color:var(--dsw-alias-label-primary,#e6edf3)}',
			'.qt-file:hover{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d9fff) 55%,transparent);color:var(--dsw-alias-brand-primary,#4d9fff)}',
			'.qt-file b{color:var(--dsw-alias-brand-primary,#4d9fff);font-weight:600}',
			'.qt-ev{border-top:1px dashed var(--dsw-alias-border-l1,#2a3d54);padding:4px 0 0;margin-top:4px;font-size:11px}',
			'.qt-ev:first-child{border-top:none;padding-top:0;margin-top:0}',
			'.qt-evmeta{display:flex;gap:5px;align-items:center;flex-wrap:wrap;color:var(--dsw-alias-label-secondary,#9fb3c8);font-size:10px}',
			'.qt-board{flex:1;min-height:0;overflow:auto;display:flex;gap:8px;padding:2px 10px 10px;align-items:flex-start}',
			'.qt-col{min-width:150px;max-width:210px;flex:0 0 auto;border:1px solid var(--dsw-alias-border-l1,#2a3d54);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#10263f);padding:6px;--st:#62758a}',
			'.qt-colhead{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#9fb3c8);padding:0 2px 4px}',
			'.qt-colhead b{color:var(--st,#9fb3c8);font-weight:650}',
			'.qt-colhead .n{margin-left:auto;color:var(--dsw-alias-label-secondary,#9fb3c8)}',
			'.qt-card{border:1px solid var(--dsw-alias-border-l1,#2a3d54);border-radius:8px;background:var(--dsw-alias-bg-base,#0b1d33);padding:5px 7px;margin-top:5px;cursor:pointer;--st:#62758a}',
			'.qt-card:hover{border-color:color-mix(in srgb,var(--st,#62758a) 55%,transparent)}',
			'.qt-cardtitle{font-size:11.5px;display:flex;gap:5px;align-items:flex-start}',
			'.qt-cardmeta{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}',
			'.qt-brief{flex:1;min-height:0;overflow:auto;padding:4px 12px 10px;font-size:12px}',
			'.qt-empty{margin:auto;text-align:center;color:var(--dsw-alias-label-secondary,#9fb3c8);font-size:12px;padding:30px 20px;max-width:320px}',
			'.qt-empty .big{font-size:26px;opacity:.55;margin-bottom:6px}',
			'.qt-empty code{font-size:11px}',
			'.qt-next{flex:none;border-top:1px solid var(--dsw-alias-border-l1,#2a3d54);padding:7px 12px 8px;background:var(--dsw-alias-bg-base,#0b1d33)}',
			'.qt-nexth{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.06em;color:var(--dsw-alias-label-secondary,#9fb3c8);font-weight:650;text-transform:uppercase;margin-bottom:2px}',
			'.qt-nextrow{display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;font-size:11.5px}',
			'.qt-nextrow:hover .qt-t{text-decoration:underline}',
			'.qt-nextrow .qt-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.qt-mut{color:var(--dsw-alias-label-secondary,#9fb3c8)}',
			'.qt-err{margin:10px 12px;padding:8px 10px;border:1px solid color-mix(in srgb,#f85149 50%,transparent);border-radius:8px;color:#f85149;font-size:11px;overflow-wrap:anywhere}',
			'.qt-loading{margin:auto;color:var(--dsw-alias-label-secondary,#9fb3c8);font-size:11.5px}',
		].join('');

		function injectCss() {
			if (typeof document === 'undefined') return;
			try {
				if (document.getElementById('dsh-questtree-panel-css')) return;
				var style = document.createElement('style');
				style.id = 'dsh-questtree-panel-css';
				style.textContent = CSS;
				document.head.appendChild(style);
			} catch (error) {
				// A host without a DOM (tests, SSR) simply skips styling.
			}
		}

		function naturalCompare(a, b) {
			return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
		}

		function childrenOf(nodes, id) {
			return nodes.filter(function (n) { return n.parentId === id; }).sort(function (a, b) { return naturalCompare(a.id, b.id); });
		}

		function findNode(nodes, id) {
			for (var i = 0; i < nodes.length; i += 1) if (nodes[i].id === id) return nodes[i];
			return null;
		}

		function byIdMap(nodes) {
			var map = {};
			for (var i = 0; i < nodes.length; i += 1) map[nodes[i].id] = nodes[i];
			return map;
		}

		function breadcrumbOf(nodes, id) {
			var map = byIdMap(nodes);
			var out = [];
			var cur = map[id] || null;
			var guard = {};
			while (cur && !guard[cur.id]) {
				guard[cur.id] = true;
				out.unshift(cur);
				cur = cur.parentId === null ? null : (map[cur.parentId] || null);
			}
			return out;
		}

		function isCovered(node, item, index) {
			var evidence = node.evidence || [];
			for (var i = 0; i < evidence.length; i += 1) {
				var covers = evidence[i].covers || [];
				for (var j = 0; j < covers.length; j += 1) {
					if (covers[j] === '*' || covers[j] === item || covers[j] === String(index)) return true;
				}
			}
			return false;
		}

		function preorderRows(tree) {
			var nodes = tree.nodes || [];
			var root = null;
			for (var i = 0; i < nodes.length; i += 1) if (nodes[i].parentId === null) { root = nodes[i]; break; }
			var out = [];
			if (!root) {
				for (var k = 0; k < nodes.length; k += 1) out.push({ node: nodes[k], depth: 0 });
				return out;
			}
			out.push({ node: root, depth: 0 });
			var walk = function (id, depth) {
				var kids = childrenOf(nodes, id);
				for (var j = 0; j < kids.length; j += 1) {
					out.push({ node: kids[j], depth: depth });
					walk(kids[j].id, depth + 1);
				}
			};
			walk(root.id, 1);
			return out;
		}

		function ancestorCollapsed(node, map, collapsed) {
			var parent = node.parentId === null ? null : map[node.parentId];
			var guard = {};
			while (parent && !guard[parent.id]) {
				guard[parent.id] = true;
				if (collapsed[parent.id] === true) return true;
				parent = parent.parentId === null ? null : map[parent.parentId];
			}
			return false;
		}

		function hasMatchingDescendant(node, map, query, cache) {
			if (cache[node.id] !== undefined) return cache[node.id];
			var kids = Object.keys(map).filter(function (id) { return map[id].parentId === node.id; });
			var hit = false;
			for (var i = 0; i < kids.length && !hit; i += 1) {
				var kid = map[kids[i]];
				if (matchesQuery(kid, query) || hasMatchingDescendant(kid, map, query, cache)) hit = true;
			}
			cache[node.id] = hit;
			return hit;
		}

		function matchesQuery(node, query) {
			if (!query) return false;
			return String(node.title || '').toLowerCase().indexOf(query) >= 0 || String(node.id || '').toLowerCase().indexOf(query) >= 0;
		}

		function visibleRows(tree, collapsed, rawQuery) {
			var rows = preorderRows(tree);
			var query = String(rawQuery || '').trim().toLowerCase();
			var map = byIdMap(tree.nodes || []);
			if (!query) {
				return rows.filter(function (row) { return !ancestorCollapsed(row.node, map, collapsed); });
			}
			var cache = {};
			return rows.filter(function (row) {
				return matchesQuery(row.node, query) || hasMatchingDescendant(row.node, map, query, cache);
			});
		}

		function fmtFile(file) {
			if (!file) return '';
			var name = String(file.path || '');
			var base = name.split(/[\\/]/).pop();
			var line = file.line ? ':' + file.line : '';
			return base + line;
		}

		function isWindowsAbs(path) {
			return /^[A-Za-z]:[\\/]/.test(path);
		}

		function sessionFileAddress(sessionId, path) {
			var normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
			var encoded = normalized.split('/').map(encodeURIComponent).join('/');
			return 'dsh-resource://file/session/' + encodeURIComponent(sessionId) + '/' + encoded;
		}

		function fileAddressFor(sessionId, cwd, path) {
			var normalized = String(path || '').replace(/\\/g, '/');
			if (!(normalized.charAt(0) === '/' || isWindowsAbs(normalized))) return sessionFileAddress(sessionId, normalized);
			var root = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
			if (root && normalized === root) return sessionFileAddress(sessionId, '');
			if (root && normalized.indexOf(root + '/') === 0) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
			return sessionFileAddress(sessionId, normalized);
		}

		// ---- minimal markdown ----
		function inline(text, keyBase) {
			var out = [];
			var rest = String(text === undefined || text === null ? '' : text);
			var re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
			var last = 0;
			var m;
			var i = 0;
			while ((m = re.exec(rest))) {
				if (m.index > last) out.push(rest.slice(last, m.index));
				var token = m[0];
				if (token.slice(0, 2) === '**') {
					out.push(h('strong', { key: keyBase + '-b' + i }, token.slice(2, -2)));
				} else if (token.charAt(0) === '`') {
					out.push(h('code', { key: keyBase + '-c' + i, className: 'qt-code' }, token.slice(1, -1)));
				} else {
					var lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
					if (lm) out.push(h('a', { key: keyBase + '-a' + i, href: lm[2], target: '_blank', rel: 'noreferrer' }, lm[1]));
					else out.push(token);
				}
				last = m.index + token.length;
				i += 1;
			}
			if (last < rest.length) out.push(rest.slice(last));
			return out;
		}

		function renderMd(text, keyBase) {
			var src = String(text === undefined || text === null ? '' : text).replace(/\r\n/g, '\n');
			if (!src.trim()) return null;
			var lines = src.split('\n');
			var blocks = [];
			var i = 0;
			var k = 0;
			while (i < lines.length) {
				var line = lines[i];
				if (/^```/.test(line)) {
					var buf = [];
					i += 1;
					while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
					i += 1;
					blocks.push(h('pre', { key: keyBase + '-pre' + (k += 1), className: 'qt-pre' }, h('code', null, buf.join('\n'))));
					continue;
				}
				var hm = /^(#{1,6})\s+(.*)$/.exec(line);
				if (hm) {
					blocks.push(h('div', { key: keyBase + '-h' + (k += 1), className: 'qt-mdh' }, inline(hm[2], keyBase + '-h' + k)));
					i += 1;
					continue;
				}
				if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
					var items = [];
					while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
						items.push(h('li', { key: keyBase + '-li' + (k += 1) }, inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''), keyBase + '-li' + k)));
						i += 1;
					}
					blocks.push(h('ul', { key: keyBase + '-ul' + (k += 1) }, items));
					continue;
				}
				if (!line.trim()) { i += 1; continue; }
				var para = [line];
				i += 1;
				while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
					para.push(lines[i]);
					i += 1;
				}
				blocks.push(h('p', { key: keyBase + '-p' + (k += 1) }, inline(para.join(' '), keyBase + '-p' + k)));
			}
			return blocks;
		}

		// ---- small view helpers ----
		function Chip(props) {
			var style = props.color ? { '--st': props.color } : undefined;
			return h('span', { className: 'qt-chip' + (props.plain ? ' plain' : ''), style: style, title: props.title || undefined }, props.children);
		}

		function Section(props) {
			if (props.children === null || props.children === undefined || props.children === false) return null;
			if (Array.isArray(props.children) && props.children.length === 0) return null;
			return h('div', { className: 'qt-sec' }, h('div', { className: 'qt-sech' }, props.title), h('div', { className: 'qt-secb' }, props.children));
		}

		function StatusDot(props) {
			return h('span', { className: 'qt-dot', style: { '--st': STATUS_COLOR[props.status] || '#62758a' } });
		}

		function FileChips(props) {
			var files = props.files || [];
			if (!files.length) return null;
			return h('div', { className: 'qt-files' }, files.map(function (file, index) {
				return h('span', {
					key: 'f' + index,
					className: 'qt-file',
					title: file.path + (file.line ? ':' + file.line : ''),
					onClick: function (event) { event.stopPropagation(); props.onOpen(file.path, file.line || null); },
				}, fmtFile(file), file.line ? null : h('span', { className: 'qt-mut' }, ' '));
			}));
		}

		function Detail(props) {
			var node = props.node;
			var status = node.status;
			var doneWhen = node.doneWhen || [];
			var evidence = node.evidence || [];
			var files = node.files || [];
			var links = node.links || [];
			var missing = [];
			for (var i = 0; i < doneWhen.length; i += 1) if (!isCovered(node, doneWhen[i], i)) missing.push(i);
			var current = props.currentNodeId === node.id;
			return h('div', { className: 'qt-detail', style: { '--st': STATUS_COLOR[status] || '#3d5370' } },
				h('div', { className: 'qt-dhead' },
					h('span', { className: 'qt-did' }, node.id),
					h(Chip, { color: STATUS_COLOR[status], title: STATUS_LABEL[status] + ' / ' + (KIND_LABEL[node.kind] || node.kind) }, STATUS_LABEL[status] || status),
					node.kind && node.kind !== 'task' ? h('span', { className: 'qt-kind' }, KIND_LABEL[node.kind] || node.kind) : null,
					node.owner ? h('span', { className: 'qt-pill' }, '@' + node.owner) : null,
					current ? h('span', { className: 'qt-here' }, '你在这') : null,
					node.progress ? h('span', { className: 'qt-pill' }, node.progress) : null,
					h('span', { className: 'qt-spacer' }),
					h('span', { className: 'qt-mut', style: { fontSize: '10px' } }, node.updatedAt ? new Date(node.updatedAt).toLocaleString() : '')
				),
				h(Section, { title: '决策' }, node.decision ? renderMd(node.decision, 'dec') : h('span', { className: 'qt-mut' }, '尚未拍板')),
				h(Section, { title: '实施 preview' }, node.implementation ? renderMd(node.implementation, 'imp') : h('span', { className: 'qt-mut' }, '尚未记录实施')),
				node.review ? h(Section, { title: '评审 ' + (node.review.verdict === 'pass' ? '通过' : '需修改') },
					h('div', { className: 'qt-ev' },
						h('div', { className: 'qt-evmeta' },
							h('span', { className: 'qt-kind' }, node.review.verdict === 'pass' ? '通过' : '需修改'),
							node.review.at ? h('span', null, new Date(node.review.at).toLocaleString()) : null,
							node.review.by ? h('span', null, node.review.by) : null
						),
						node.review.note ? h('div', { className: 'qt-mut', style: { fontSize: '11px', marginTop: '2px' } }, renderMd(node.review.note, 'rev')) : null
					)
				) : (status === 'implemented' ? h(Section, { title: '评审' }, h('span', { className: 'qt-mut' }, '待评审：按验收项核对证据后 quest_tree_review verdict: pass 才能关闭')) : null),
				doneWhen.length ? h(Section, { title: '验收 ' + (doneWhen.length - missing.length) + '/' + doneWhen.length },
					doneWhen.map(function (item, index) {
						var covered = isCovered(node, item, index);
						return h('div', { key: 'dw' + index, className: 'qt-check' + (covered ? ' done' : '') },
							h('i', null, covered ? '✓' : '○'),
							h('span', null, inline(item, 'dw' + index))
						);
					})
				) : null,
				evidence.length ? h(Section, { title: '证据 ' + evidence.length },
					evidence.map(function (item, index) {
						var covers = (item.covers || []).join(' · ');
						return h('div', { key: 'ev' + index, className: 'qt-ev' },
							h('div', { className: 'qt-evmeta' },
								h('span', { className: 'qt-kind' }, EVIDENCE_LABEL[item.kind] || item.kind || '证据'),
								item.at ? h('span', null, new Date(item.at).toLocaleString()) : null,
								covers ? h('span', null, '覆盖: ' + covers) : null
							),
							h('div', { style: { marginTop: '2px' } }, h('code', { className: 'qt-code' }, item.ref || '')),
							item.note ? h('div', { className: 'qt-mut', style: { fontSize: '11px', marginTop: '2px' } }, renderMd(item.note, 'evn' + index)) : null
						);
					})
				) : null,
				files.length ? h(Section, { title: '改动文件 ' + files.length }, h(FileChips, { files: files, onOpen: props.onOpen })) : null,
				links.length ? h(Section, { title: '关联 ' + links.length },
					h('div', { className: 'qt-files' }, links.map(function (link, index) {
						return h('span', { key: 'l' + index, className: 'qt-file', title: link.ref }, (LINK_LABEL[link.kind] || link.kind) + ' · ' + (link.label || link.ref));
					}))
				) : null,
				(node.blockedBy || []).length ? h(Section, { title: '依赖' },
					h('div', { className: 'qt-files' }, (node.blockedBy || []).map(function (id) {
						return h('span', { key: 'b' + id, className: 'qt-file', onClick: function (event) { event.stopPropagation(); props.onFocusNode(id); } }, id);
					}))
				) : null,
				node.note ? h(Section, { title: '备注' }, renderMd(node.note, 'note')) : null,
				(!node.decision && !node.implementation && !node.review && !doneWhen.length && !evidence.length && !files.length && !links.length && !node.note)
					? h('div', { className: 'qt-mut', style: { fontSize: '11px' } }, '还没有决策 / 实施 / 验收 / 证据记录。拍板后写决策，实施后补 preview 和 files，验收时补证据。')
					: null
			);
		}

		function QuestTreePane(props) {
			injectCss();
			var sessionId = props && props.sessionId ? String(props.sessionId) : '';
			var cwd = '';
			if (sessionId && typeof props.useSessions === 'function') {
				try {
					cwd = props.useSessions(function (sessions) {
						var rec = sessions && sessions.byId ? sessions.byId[sessionId] : null;
						return rec && rec.cwd ? String(rec.cwd) : '';
					}) || '';
				} catch (error) {
					cwd = '';
				}
			}
			var url = '/plugins/quest-tree/state?session=' + encodeURIComponent(sessionId) + (cwd ? '&cwd=' + encodeURIComponent(cwd) : '');

			var payloadState = useState(null);
			var payload = payloadState[0];
			var setPayload = payloadState[1];
			var errorState = useState(null);
			var error = errorState[0];
			var setError = errorState[1];
			var loadingState = useState(true);
			var loading = loadingState[0];
			var setLoading = loadingState[1];
			var viewState = useState('tree');
			var view = viewState[0];
			var setView = viewState[1];
			var queryState = useState('');
			var query = queryState[0];
			var setQuery = queryState[1];
			var collapsedState = useState({});
			var collapsed = collapsedState[0];
			var setCollapsed = collapsedState[1];
			var selectedState = useState(null);
			var selected = selectedState[0];
			var setSelected = selectedState[1];

			useEffect(function () {
				var alive = true;
				var timer = null;
				var tick = function () {
					fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } })
						.then(function (response) {
							if (!response.ok) throw new Error('HTTP ' + response.status);
							return response.json();
						})
						.then(function (data) {
							if (!alive) return;
							setPayload(data);
							setError(null);
						})
						.catch(function (fetchError) {
							if (!alive) return;
							setError(String((fetchError && fetchError.message) || fetchError));
						})
						.then(function () {
							if (!alive) return;
							setLoading(false);
							timer = setTimeout(tick, 1500);
						});
				};
				tick();
				return function () {
					alive = false;
					if (timer) clearTimeout(timer);
				};
			}, [url]);

			var tree = payload && payload.tree ? payload.tree : null;
			var nodes = tree ? (tree.nodes || []) : [];
			var metrics = (payload && payload.metrics) || { counts: {}, total: 0, progress: 0, evidenceCoverage: 0, evidenceMissing: 0, blockedAging: [] };
			var currentNodeId = payload && payload.view ? payload.view.currentNodeId : null;
			var next = payload && payload.next ? payload.next : { todo: [], questions: [], doing: [] };
			var blockers = payload && payload.blockers ? payload.blockers : [];

			var rows = useMemo(function () { return tree ? visibleRows(tree, collapsed, query) : []; }, [tree, collapsed, query]);
			var map = useMemo(function () { return byIdMap(nodes); }, [nodes]);
			var current = currentNodeId && map[currentNodeId] ? map[currentNodeId] : null;

			var openFile = function (path, line) {
				if (!props || typeof props.openResource !== 'function' || !sessionId) return;
				try {
					var address = fileAddressFor(sessionId, cwd, path);
					if (line) props.openResource(address, { params: { line: line } });
					else props.openResource(address);
				} catch (errorOpen) {
					// Navigation is best-effort; the panel never breaks on a host without the sidebar service.
				}
			};

			var toggleCollapse = function (id) {
				var nextCollapsed = {};
				for (var key in collapsed) if (collapsed[key]) nextCollapsed[key] = true;
				if (nextCollapsed[id]) delete nextCollapsed[id];
				else nextCollapsed[id] = true;
				setCollapsed(nextCollapsed);
			};

			var anyExpanded = nodes.some(function (node) { return node.parentId !== null && collapsed[node.id] !== true; });

			var foldAll = function () {
				if (anyExpanded) {
					var all = {};
					for (var i = 0; i < nodes.length; i += 1) all[nodes[i].id] = true;
					setCollapsed(all);
				} else {
					setCollapsed({});
				}
			};

			var focusNode = function (id) {
				setSelected(id);
				var chain = breadcrumbOf(nodes, id);
				var nextCollapsed = {};
				for (var key in collapsed) if (collapsed[key]) nextCollapsed[key] = true;
				for (var i = 0; i < chain.length; i += 1) delete nextCollapsed[chain[i].id];
				setCollapsed(nextCollapsed);
			};

			var header = h('div', { className: 'qt-head' },
				h('span', { className: 'qt-htitle' }, '任务树'),
				tree ? h('span', { className: 'qt-hmeta', title: tree.name }, tree.name || '(未命名)') : null,
				h('span', { className: 'qt-spacer' }),
				tree ? h('button', { className: 'qt-btn', onClick: foldAll, title: '折叠/展开所有分支' }, anyExpanded ? '全部折叠' : '全部展开') : null
			);

			var body = null;
			if (!payload && loading) {
				body = h('div', { className: 'qt-loading' }, '正在读取任务树…');
			} else if (error && !payload) {
				body = h('div', { className: 'qt-err' }, '无法读取任务树：' + error);
			} else if (!tree) {
				body = h('div', { className: 'qt-empty' },
					h('div', { className: 'big' }, '🌳'),
					h('div', null, '暂无任务树'),
					h('div', { className: 'qt-mut', style: { marginTop: '6px' } },
						'让 agent 用 ', h('code', { className: 'qt-code' }, 'quest_tree_plan'), ' 一次铺开，或 ',
						h('code', { className: 'qt-code' }, 'quest_tree_create'), ' 先建主线。')
				);
			} else {
				var counts = metrics.counts || {};
				var goalCard = h('div', { className: 'qt-goal' },
					h('div', { className: 'qt-goalline' },
						h('span', { className: 'qt-goalkey' }, '目标'),
						h('span', { className: 'qt-goaltext', title: tree.goal || tree.description || '' }, tree.goal || tree.description || '（未填写目标）')
					),
					h('div', { className: 'qt-bar' }, h('i', { style: { width: Math.max(0, Math.min(100, metrics.progress || 0)) + '%' } })),
					h('div', { className: 'qt-chips' },
						h(Chip, { color: STATUS_COLOR.pending_decision }, '待拍 ' + (counts.pending_decision || 0)),
						h(Chip, { color: STATUS_COLOR.in_progress }, '进行中 ' + (counts.in_progress || 0)),
						h(Chip, { color: STATUS_COLOR.implemented }, '待验 ' + (counts.implemented || 0)),
						metrics.awaitingReview ? h(Chip, { color: '#d29922' }, '待评审 ' + metrics.awaitingReview) : null,
						h(Chip, { color: STATUS_COLOR.blocked }, '阻塞 ' + (counts.blocked || 0)),
						h(Chip, { color: STATUS_COLOR.closed }, '已闭 ' + (counts.closed || 0) + '/' + (metrics.total || 0)),
						h(Chip, { plain: true }, '进度 ' + (metrics.progress || 0) + '%'),
						metrics.doneWhenTotal ? h(Chip, { color: metrics.evidenceMissing ? '#d29922' : '#3fb950' }, '验收 ' + metrics.doneWhenCovered + '/' + metrics.doneWhenTotal) : null,
						metrics.rework ? h(Chip, { color: '#d29922' }, '返工 ' + metrics.rework) : null
					)
				);

				var crumb = h('div', { className: 'qt-crumb' },
					h('span', null, '当前：'),
					h('span', null, breadcrumbOf(nodes, currentNodeId).map(function (node, index, all) {
						return h('span', { key: node.id },
							h('b', null, node.title || node.id),
							index < all.length - 1 ? h('span', { className: 'qt-mut' }, ' / ') : null
						);
					})),
					current ? null : h('span', { className: 'qt-mut' }, '（未设置）')
				);

				var alerts = [];
				if (metrics.blocked) alerts.push(h('span', { key: 'bl', style: { color: STATUS_COLOR.blocked } }, metrics.blocked + ' 个阻塞'));
				if (metrics.awaitingVerify) alerts.push(h('span', { key: 'av', style: { color: STATUS_COLOR.implemented } }, metrics.awaitingVerify + ' 个待验收'));
				if (metrics.awaitingReview) alerts.push(h('span', { key: 'ar', style: { color: '#d29922' } }, metrics.awaitingReview + ' 个待评审'));
				if (metrics.evidenceMissing) alerts.push(h('span', { key: 'em', style: { color: '#d29922' } }, '缺 ' + metrics.evidenceMissing + ' 项验收证据'));
				if (blockers.length) alerts.push(h('span', { key: 'un', style: { color: '#4d9fff' }, title: blockers.map(function (b) { return b.id + ' 解锁 ' + b.unlocks; }).join('\n') }, '关键路径 ' + blockers[0].id + '（解锁 ' + blockers[0].unlocks + '）'));

				var toolbar = h('div', { className: 'qt-tools' },
					h('div', { className: 'qt-seg' },
						h('button', { className: view === 'tree' ? 'on' : '', onClick: function () { setView('tree'); } }, '树'),
						h('button', { className: view === 'board' ? 'on' : '', onClick: function () { setView('board'); } }, '看板'),
						h('button', { className: view === 'brief' ? 'on' : '', onClick: function () { setView('brief'); } }, '简报')
					),
					h('input', {
						className: 'qt-search',
						placeholder: '搜索节点 / 编号',
						value: query,
						onChange: function (event) { setQuery(event.target.value); },
					})
				);

				var treeView = h('div', { className: 'qt-rows' },
					rows.length === 0
						? h('div', { className: 'qt-empty', style: { padding: '18px' } }, query ? '没有匹配的节点' : '树还是空的，用 quest_tree_plan 铺开第一批任务')
						: rows.map(function (row) {
							var node = row.node;
							var here = node.id === currentNodeId;
							var isSelected = node.id === selected;
							var kids = childrenOf(nodes, node.id);
							var hasKids = kids.length > 0;
							var doneWhen = node.doneWhen || [];
							var covered = 0;
							for (var i = 0; i < doneWhen.length; i += 1) if (isCovered(node, doneWhen[i], i)) covered += 1;
							var files = node.files || [];
							return h('div', { key: node.id },
								h('div', {
									className: 'qt-row' + (here ? ' here' : '') + (isSelected ? ' sel' : '') + (node.parked ? ' parked' : ''),
									style: { '--st': STATUS_COLOR[node.status] || '#62758a', paddingLeft: (10 + row.depth * 12) + 'px' },
									onClick: function () { setSelected(isSelected ? null : node.id); },
								},
									h('span', {
										className: 'qt-caret' + (hasKids ? '' : ' hidden'),
										onClick: function (event) { event.stopPropagation(); toggleCollapse(node.id); },
									}, collapsed[node.id] === true ? '▸' : '▾'),
									h(StatusDot, { status: node.status }),
									h('span', { className: 'qt-title', title: node.title }, node.title),
									node.kind && node.kind !== 'task' && node.kind !== 'milestone' ? h('span', { className: 'qt-kind' }, KIND_LABEL[node.kind] || node.kind) : null,
									doneWhen.length ? h('span', { className: 'qt-pill' + (covered === doneWhen.length ? ' ok' : '') }, '验收 ' + covered + '/' + doneWhen.length) : null,
									files.length ? h('span', { className: 'qt-pill' }, '⌘' + files.length) : null,
									(node.evidence || []).length ? h('span', { className: 'qt-pill' }, '证 ' + node.evidence.length) : null,
									node.status === 'implemented' ? h('span', { className: 'qt-pill' + (node.review && node.review.verdict === 'pass' ? ' ok' : ' warn') }, node.review && node.review.verdict === 'pass' ? '评审✓' : '待评审') : null,
									node.owner ? h('span', { className: 'qt-pill' }, '@' + node.owner) : null,
									(node.blockedBy || []).length ? h('span', { className: 'qt-pill warn' }, '依赖') : null,
									node.parked ? h('span', { className: 'qt-pill' }, '停靠') : null,
									here ? h('span', { className: 'qt-here' }, '你在这') : null
								),
								isSelected ? h(Detail, {
									node: node,
									currentNodeId: currentNodeId,
									onOpen: openFile,
									onFocusNode: focusNode,
								}) : null
							);
						})
				);

				var boardView = h('div', { className: 'qt-board' },
					BOARD_ORDER.map(function (status) {
						var columnNodes = nodes.filter(function (node) { return node.status === status && !node.parked; });
						return h('div', { key: status, className: 'qt-col' },
							h('div', { className: 'qt-colhead', style: { '--st': STATUS_COLOR[status] } },
								h(StatusDot, { status: status }),
								h('b', null, STATUS_LABEL[status] || status),
								h('span', { className: 'n' }, columnNodes.length)
							),
							columnNodes.map(function (node) {
								var doneWhen = node.doneWhen || [];
								var covered = 0;
								for (var i = 0; i < doneWhen.length; i += 1) if (isCovered(node, doneWhen[i], i)) covered += 1;
								return h('div', { key: node.id, className: 'qt-card', style: { '--st': STATUS_COLOR[status] }, onClick: function () { setSelected(node.id); setView('tree'); } },
									h('div', { className: 'qt-cardtitle' },
										h('span', { className: 'qt-mut', style: { fontSize: '10px', flex: 'none' } }, node.id),
										h('span', { style: { minWidth: 0 } }, node.title)
									),
									h('div', { className: 'qt-cardmeta' },
										node.kind && node.kind !== 'task' ? h('span', { className: 'qt-kind' }, KIND_LABEL[node.kind] || node.kind) : null,
										doneWhen.length ? h('span', { className: 'qt-pill' }, '验收 ' + covered + '/' + doneWhen.length) : null,
										(node.evidence || []).length ? h('span', { className: 'qt-pill' }, '证 ' + node.evidence.length) : null,
										node.status === 'implemented' ? h('span', { className: 'qt-pill' + (node.review && node.review.verdict === 'pass' ? ' ok' : ' warn') }, node.review && node.review.verdict === 'pass' ? '评审✓' : '待评审') : null,
										node.owner ? h('span', { className: 'qt-pill' }, '@' + node.owner) : null,
										(node.files || []).length ? h('span', { className: 'qt-pill' }, '⌘' + node.files.length) : null
									)
								);
							}),
							columnNodes.length === 0 ? h('div', { className: 'qt-mut', style: { fontSize: '10.5px', padding: '4px 2px' } }, '—') : null
						);
					})
				);

				var briefView = h('div', { className: 'qt-brief' }, renderMd(payload.brief || '', 'brief'));

				var footerItems = (next.todo || []).slice(0, 3);
				var footer = h('div', { className: 'qt-next' },
					h('div', { className: 'qt-nexth' },
						h('span', null, '下一步'),
						(next.questions || []).length ? h('span', { className: 'qt-mut', style: { textTransform: 'none', letterSpacing: 0 } }, '· 待拍 ' + next.questions.length) : null
					),
					footerItems.length
						? footerItems.map(function (item) {
							return h('div', { key: item.id, className: 'qt-nextrow', onClick: function () { focusNode(item.id); }, title: item.title },
								h(StatusDot, { status: item.status }),
								h('span', { className: 'qt-t' }, item.title),
								item.doneWhen ? h('span', { className: 'qt-pill' }, '验收 ' + item.doneWhen) : null
							);
						})
						: h('div', { className: 'qt-mut', style: { fontSize: '11px' } }, (next.questions || []).length ? '先等用户拍板待拍问题。' : '没有依赖就绪的 todo。')
				);

				body = h(React.Fragment, null,
					goalCard,
					crumb,
					alerts.length ? h('div', { className: 'qt-alert' }, alerts) : null,
					toolbar,
					h('div', { className: 'qt-body' }, view === 'tree' ? treeView : view === 'board' ? boardView : briefView),
					footer
				);
			}

			return h('div', { className: 'qt-root' }, header, body);
		}

		injectCss();

		return {
			inject: ['slots'],
			apply(ctx) {
				ctx.inject(['sidebarRight', 'sidebarRightTabs'], function (native) {
					native.effect(function () {
						return native.sidebarRightTabs.register({
							id: TAB_ID,
							kind: TAB_KIND,
							title: function () { return '任务树'; },
							guide: [{
								id: 'quest-tree',
								title: function () { return '任务树'; },
								description: function () { return '当前项目的主线 + 分支、验收与证据'; },
								order: 70,
							}],
						});
					});
					native.slots.inject('sidebar.right.pane.tab', function () {
						return native.slots.register({
							name: 'sidebar.right.pane.tab',
							key: TAB_ID,
							inject: function () {
								return {
									openResource: function (address, options) {
										if (native.sidebarRight && typeof native.sidebarRight.openResource === 'function') {
											return native.sidebarRight.openResource(address, options);
										}
										return undefined;
									},
								};
							},
						}, QuestTreePane);
					});
				});
			},
		};
	},
});
