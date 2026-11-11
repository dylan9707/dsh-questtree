window.__ModuleLoader__.load({
	id: 'dsh-questtree',
	factory(require) {
		var React = require('react');
		var h = React.createElement;

		var TAB_ID = 'dsh-questtree/panel';
		var TAB_KIND = 'dsh-questtree';

		// Right-sidebar pane: the current conversation's quest tree. The shell
		// passes the active session id, so switching conversations re-points the
		// iframe at that session's own tree.
		function QuestTreePane(props) {
			var sessionId = props && props.sessionId ? String(props.sessionId) : '';
			var src = '/plugins/quest-tree/editor' + (sessionId ? '?session=' + encodeURIComponent(sessionId) : '');
			return h('iframe', {
				src: src,
				title: '任务树',
				style: {
					width: '100%',
					height: '100%',
					border: 'none',
					background: 'var(--dsw-alias-bg-base)',
					display: 'block',
				},
			});
		}

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
								description: function () { return '当前会话的主线 + 分支任务树'; },
								order: 70,
							}],
						});
					});
					native.slots.inject('sidebar.right.pane.tab', function () {
						return native.slots.register({
							name: 'sidebar.right.pane.tab',
							key: TAB_ID,
						}, QuestTreePane);
					});
				});
			},
		};
	},
});
