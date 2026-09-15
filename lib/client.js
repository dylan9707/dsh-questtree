window.__ModuleLoader__.load({
	id: "@infmed/dsh-quest-tree",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		exports.inject = [];

		exports.apply = function apply(ctx) {
			var panel = null;
			var fab = null;
			var style = null;

			// Theme-aware chrome: reference the shell's --dsw-alias-* vars with
			// dark fallbacks so the badge/panel match the harness theme.
			style = document.createElement('style');
			style.dataset.plugin = '@infmed/dsh-quest-tree';
			style.textContent = [
				'[data-quest-tree-badge]{position:fixed;top:64px;right:calc(18px + var(--dsh-sidebar-width,0px));z-index:2147483000;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--dsw-alias-line-normal,#2a3d54);background:var(--dsw-alias-bg-module-platform,#0b1d33);color:var(--dsw-alias-label-secondary,#9fb3c8);font:600 12px/20px sans-serif;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.18);}',
				'[data-quest-tree-badge]:hover{border-color:var(--dsw-alias-line-strong,#3d5370);transform:translateY(-1px);}',
				'[data-quest-tree-dot]{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#4d9fff);}',
				'[data-quest-tree-panel]{position:fixed;top:64px;right:calc(18px + var(--dsh-sidebar-width,0px));z-index:2147483000;display:flex;flex-direction:column;width:min(430px,calc(100vw - 24px));height:min(76dvh,calc(100vh - 84px));border:1px solid var(--dsw-alias-line-normal,#2a3d54);border-radius:16px;background:var(--dsw-alias-bg-module-platform,#0b1d33);box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden;}',
				'[data-quest-tree-head]{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-line-normal,#2a3d54);flex:none;}',
				'[data-quest-tree-title]{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-primary,#e6edf3);font:600 13px/20px sans-serif;}',
				'[data-quest-tree-close]{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#9fb3c8);font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;}',
				'[data-quest-tree-close]:hover{color:var(--dsw-alias-label-primary,#e6edf3);}',
				'[data-quest-tree-frame]{width:100%;height:100%;border:none;flex:1;min-height:0;}',
			].join('\n');
			document.head.appendChild(style);

			function close() {
				if (panel) { panel.remove(); panel = null; }
				if (fab) fab.style.display = '';
			}

			function open() {
				if (panel) { close(); return; }
				if (!fab) return;
				fab.style.display = 'none';
				panel = document.createElement('section');
				panel.setAttribute('data-quest-tree-panel', '');

				var head = document.createElement('header');
				head.setAttribute('data-quest-tree-head', '');

				var title = document.createElement('span');
				title.setAttribute('data-quest-tree-title', '');
				var dot = document.createElement('span');
				dot.setAttribute('data-quest-tree-dot', '');
				var label = document.createElement('span');
				label.textContent = '任务树';
				title.appendChild(dot);
				title.appendChild(label);

				var closeBtn = document.createElement('button');
				closeBtn.setAttribute('data-quest-tree-close', '');
				closeBtn.setAttribute('aria-label', '关闭');
				closeBtn.textContent = '×';
				closeBtn.addEventListener('click', close);

				head.appendChild(title);
				head.appendChild(closeBtn);

				var frame = document.createElement('iframe');
				frame.setAttribute('data-quest-tree-frame', '');
				frame.src = '/plugins/quest-tree/editor';

				panel.appendChild(head);
				panel.appendChild(frame);
				document.body.appendChild(panel);
			}

			fab = document.createElement('button');
			fab.setAttribute('data-quest-tree-badge', '');
			fab.setAttribute('aria-label', '任务树');
			var fdot = document.createElement('span');
			fdot.setAttribute('data-quest-tree-dot', '');
			var flabel = document.createElement('span');
			flabel.textContent = '任务树';
			fab.appendChild(fdot);
			fab.appendChild(flabel);
			fab.addEventListener('click', function () { if (panel) close(); else open(); });
			document.body.appendChild(fab);

			var onMessage = function (e) {
				if (e.data === 'quest-tree:close') close();
			};
			window.addEventListener('message', onMessage);

			ctx.effect(function () {
				return function () {
					if (panel) panel.remove();
					if (fab) fab.remove();
					if (style && style.parentNode) style.remove();
					window.removeEventListener('message', onMessage);
				};
			}, 'quest-tree: floater');
		};

		return module.exports;
	}
});
