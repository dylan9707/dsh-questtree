window.__ModuleLoader__.load({
	id: 'dsh-questtree',
	factory(require) {
		var React = require('react');
		var h = React.createElement;

		// Sidebar panel icon (rendered by the shell inside sidebar.panellist).
		function QuestTreeIcon(props) {
			var size = (props && props.size) || 20;
			return h('svg', {
				viewBox: '0 0 24 24',
				width: size,
				height: size,
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.7,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
				'aria-hidden': true,
			},
				h('path', { d: 'M6 21V13' }),
				h('path', { d: 'M6 13V4' }),
				h('path', { d: 'M6 9h5' }),
				h('path', { d: 'M11 9V6' }),
				h('path', { d: 'M6 16h5' }),
				h('path', { d: 'M11 16v-3' }),
				h('circle', { cx: 6, cy: 4, r: 1.4 }),
				h('circle', { cx: 11, cy: 6, r: 1.4 }),
				h('circle', { cx: 11, cy: 13, r: 1.4 }));
		}

		// Central panel content: a themed header + the existing tree editor.
		function QuestTreePanel(props) {
			return h('div', {
				style: {
					display: 'flex',
					flexDirection: 'column',
					width: '100%',
					height: '100%',
					minHeight: 0,
					background: 'var(--dsw-alias-bg-base)',
					color: 'var(--dsw-alias-label-primary)',
					overflow: 'hidden',
				},
			},
				h('header', {
					style: {
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 8,
						padding: '10px 16px',
						borderBottom: '1px solid var(--dsw-alias-border-l1)',
						background: 'var(--dsw-alias-bg-layer-1)',
						flex: 'none',
					},
				},
					h('span', {
						style: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
					}, '任务树'),
					h('button', {
						type: 'button',
						onClick: props.onBack,
						style: {
							border: '1px solid var(--dsw-alias-border-l1)',
							background: 'transparent',
							color: 'var(--dsw-alias-label-secondary)',
							borderRadius: 6,
							padding: '3px 10px',
							fontSize: 12,
							lineHeight: '20px',
							cursor: 'pointer',
						},
					}, '返回会话')),
				h('iframe', {
					src: '/plugins/quest-tree/editor',
					title: '任务树',
					style: {
						width: '100%',
						flex: 1,
						minHeight: 0,
						border: 'none',
						background: 'var(--dsw-alias-bg-base)',
					},
				}));
		}

		return {
			inject: ['slots', 'layout'],
			apply(ctx) {
				// Global panel icon; the shell owns the button and selects the
				// matching `main` panel by this id.
				ctx.slots.inject('sidebar.panellist', function () {
					return ctx.slots.register({
						name: 'sidebar.panellist',
						id: 'quest-tree',
						order: 1,
						label: '任务树',
					}, QuestTreeIcon);
				});

				// Central panel body.
				ctx.slots.inject('main', function () {
					return ctx.slots.register({
						name: 'main',
						key: 'quest-tree',
					}, function () {
						return h(QuestTreePanel, {
							onBack: function () {
								try { ctx.layout.selectPanel(null); } catch (e) {}
							},
						});
					});
				});
			},
		};
	},
});
