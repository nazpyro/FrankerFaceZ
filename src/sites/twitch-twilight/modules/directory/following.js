'use strict';

// ============================================================================
// Following Page
// ============================================================================

import {SiteModule} from 'utilities/module';
import {createElement as e} from 'utilities/dom';
import {get} from 'utilities/object';

import Popper from 'popper.js';

export default class Following extends SiteModule {
	constructor(...args) {
		super(...args);

		this.inject('site.fine');
		this.inject('site.router');
		this.inject('site.apollo');
		this.inject('site.css_tweaks');

		this.inject('i18n');
		this.inject('settings');

		this.settings.add('directory.following.group-hosts', {
			default: true,

			ui: {
				path: 'Directory > Following >> Hosts',
				title: 'Group Hosts',
				description: 'Only show a given hosted channel once in the directory.',
				component: 'setting-check-box'
			},

			changed: () => {
				this.apollo.maybeRefetch('FollowedIndex_CurrentUser');
				this.apollo.maybeRefetch('FollowingHosts_CurrentUser');
			}
		});

		this.settings.add('directory.following.host-menus', {
			default: 1,

			ui: {
				path: 'Directory > Following >> Hosts',
				title: 'Hosted Channel Menus',
				description: 'Display a menu to select which channel to visit when clicking a hosted channel in the directory.',

				component: 'setting-select-box',

				data: [
					{value: 0, title: 'Disabled'},
					{value: 1, title: 'When Multiple are Hosting'},
					{value: 2, title: 'Always'}
				]
			},

			changed: () => this.ChannelCard.forceUpdate()
		});

		this.apollo.registerModifier('FollowedIndex_CurrentUser', this.apollo.gql`query {
			currentUser {
				followedLiveUsers {
					nodes {
						profileImageURL(width: 70)
						stream {
							createdAt
						}
					}
				}
				followedHosts {
					nodes {
						profileImageURL(width: 70)
						hosting {
							profileImageURL(width: 70)
							stream {
								createdAt
								type
							}
						}
					}
				}
			}
		}`);

		this.apollo.registerModifier('FollowingLive_CurrentUser', this.apollo.gql`query {
			currentUser {
				followedLiveUsers {
					edges {
						node {
							profileImageURL(width: 70)
							stream {
								createdAt
							}
						}
					}
				}
			}
		}`);

		this.apollo.registerModifier('FollowingHosts_CurrentUser', this.apollo.gql`query {
			currentUser {
				followedHosts {
					nodes {
						profileImageURL(width: 70)
						hosting {
							profileImageURL(width: 70)
							stream {
								createdAt
							}
						}
					}
				}
			}
		}`);

		this.apollo.registerModifier('FollowedChannels', this.apollo.gql`query {
			currentUser {
				followedLiveUsers {
					nodes {
						profileImageURL(width: 70)
						stream {
							type
							createdAt
						}
					}
				}
			}
		}`);

		this.ChannelCard = this.fine.define(
			'following-channel-card',
			n => n.renderGameBoxArt && n.renderContentType
		);

		this.apollo.registerModifier('FollowedIndex_CurrentUser', res => {
			this.modifyLiveUsers(res);
			this.modifyLiveHosts(res);
		}, false);

		this.on('settings:changed:directory.uptime', () => this.ChannelCard.forceUpdate());
		this.on('settings:changed:directory.show-channel-avatars', () => this.ChannelCard.forceUpdate());
		this.on('settings:changed:directory.show-boxart', () => this.ChannelCard.forceUpdate());
		this.on('settings:changed:directory.hide-vodcasts', () => this.ChannelCard.forceUpdate());

		this.apollo.registerModifier('FollowedChannels', res => this.modifyLiveUsers(res), false);
		this.apollo.registerModifier('FollowingLive_CurrentUser', res => this.modifyLiveUsers(res), false);
		this.apollo.registerModifier('FollowingHosts_CurrentUser', res => this.modifyLiveHosts(res), false);
	}

	isRouteAcceptable() {
		return this.router.current.name === 'dir-following'
			|| this.router.current.name === 'dir-category' && this.router.match[1] === 'following';
	}

	modifyLiveUsers(res) {
		const hiddenThumbnails = this.settings.provider.get('directory.game.hidden-thumbnails') || [];
		const blockedGames = this.settings.provider.get('directory.game.blocked-games') || [];

		const newStreams = [];

		const followedLiveUsers = get('data.currentUser.followedLiveUsers', res);
		if (!followedLiveUsers)
			return res;

		const oldMode = !!followedLiveUsers.nodes;
		const edgesOrNodes = followedLiveUsers.nodes || followedLiveUsers.edges;

		for (let i = 0; i < edgesOrNodes.length; i++) {
			const edge = edgesOrNodes[i];
			const node = edge.node || edge;

			const s = node.stream.viewersCount = new Number(node.stream.viewersCount || 0);
			s.profileImageURL = node.profileImageURL;
			s.createdAt = node.stream.createdAt;

			if (node.stream.game && hiddenThumbnails.includes(node.stream.game.name)) node.stream.previewImageURL = 'https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg';
			if (!node.stream.game || node.stream.game && !blockedGames.includes(node.stream.game.name)) newStreams.push(edge);
		}
		res.data.currentUser.followedLiveUsers[oldMode ? 'nodes' : 'edges'] = newStreams;

		return res;
	}

	modifyLiveHosts(res) {
		const hiddenThumbnails = this.settings.provider.get('directory.game.hidden-thumbnails') || [];
		const blockedGames = this.settings.provider.get('directory.game.blocked-games') || [];

		this.hosts = {};

		const followedHosts = get('data.currentUser.followedHosts', res);
		if (!followedHosts)
			return res;

		const newHostNodes = [];

		const oldMode = !!followedHosts.nodes;
		const edgesOrNodes = followedHosts.nodes || followedHosts.edges;

		for (let i = 0; i < edgesOrNodes.length; i++) {
			const edge = edgesOrNodes[i];
			const node = edge.node || edge;

			const s = node.hosting.stream.viewersCount = new Number(node.hosting.stream.viewersCount || 0);
			s.profileImageURL = node.hosting.profileImageURL;
			s.createdAt = node.hosting.stream.createdAt;

			if (!this.hosts[node.hosting.displayName]) {
				this.hosts[node.hosting.displayName] = {
					channel: node.hosting.login,
					nodes: [node],
					channels: [node.displayName]
				};
				if (node.hosting.stream.game && hiddenThumbnails.includes(node.hosting.stream.game.name)) node.hosting.stream.previewImageURL = 'https://static-cdn.jtvnw.net/ttv-static/404_preview-320x180.jpg';
				if (!node.hosting.stream.game || node.hosting.stream.game && !blockedGames.includes(node.hosting.stream.game.name)) newHostNodes.push(edge);
			} else {
				this.hosts[node.hosting.displayName].nodes.push(node);
				this.hosts[node.hosting.displayName].channels.push(node.displayName);
			}
		}

		if (this.settings.get('directory.following.group-hosts')) {
			res.data.currentUser.followedHosts[oldMode ? 'nodes' : 'edges'] = newHostNodes;
		}
		return res;
	}

	ensureQueries () {
		if (this.router && this.router.match) {
			this.apollo.ensureQuery(
				'FollowedChannels',
				'data.currentUser.followedLiveUsers.nodes.0.profileImageURL'
			);

			if (this.router.match[1] === 'following') {
				this.apollo.ensureQuery(
					'FollowedIndex_CurrentUser',
					n =>
						get('data.currentUser.followedLiveUsers.nodes.0.profileImageURL', n) !== undefined
						||
						get('data.currentUser.followedLiveUsers.edges.0.node.profileImageURL', n) !== undefined
						||
						get('data.currentUser.followedHosts.nodes.0.hosting.profileImageURL', n) !== undefined
				);
			} else if (this.router.match[1] === 'live') {
				this.apollo.ensureQuery(
					'FollowingLive_CurrentUser',
					'data.currentUser.followedLiveUsers.nodes.0.profileImageURL' || 'data.currentUser.followedLiveUsers.edges.0.node.profileImageURL'
				);
			} else if (this.router.match[1] === 'hosts') {
				this.apollo.ensureQuery(
					'FollowingHosts_CurrentUser',
					'data.currentUser.followedHosts.nodes.0.hosting.profileImageURL'
				);
			}
		}
	}

	onEnable() {
		this.ChannelCard.ready((cls, instances) => {
			this.ensureQueries();

			for(const inst of instances) this.updateChannelCard(inst);
		});

		this.ChannelCard.on('update', inst => {
			this.ensureQueries();
			this.updateChannelCard(inst)
		}, this);
		this.ChannelCard.on('mount', this.updateChannelCard, this);
		this.ChannelCard.on('unmount', this.parent.clearUptime, this);

		document.body.addEventListener('click', this.destroyHostMenu.bind(this));
	}

	destroyHostMenu(event) {
		if (!event || event && event.target && event.target.closest('.ffz-channel-selector-outer') === null && Date.now() > this.hostMenuBuffer) {
			this.hostMenuPopper && this.hostMenuPopper.destroy();
			this.hostMenu && this.hostMenu.remove();
			this.hostMenuPopper = this.hostMenu = undefined;
		}
	}

	showHostMenu(inst, { channels }, event) {
		if (this.settings.get('directory.following.host-menus') === 0 || this.settings.get('directory.following.host-menus') === 1 && channels.length < 2) return;

		event.preventDefault();
		event.stopPropagation();

		this.hostMenuPopper && this.hostMenuPopper.destroy();

		this.hostMenu && this.hostMenu.remove();

		const hostData = this.hosts[inst.props.channelName];
		const simplebarContentChildren = [];

		// Hosted Channel Header
		simplebarContentChildren.push(
			e('p', {
				className: 'tw-pd-t-05 tw-pd-x-1 tw-c-text-alt-2',
				textContent: this.i18n.t('directory.hosted', 'Hosted Channel')
			})
		);

		// Hosted Channel Content
		simplebarContentChildren.push(
			e('a', {
				className: 'tw-interactable',
				href: `/${hostData.channel}`,
				onclick: event =>
					this.parent.hijackUserClick(
						event,
						hostData.channel,
						this.destroyHostMenu.bind(this)
					)
			}, e('div', 'tw-align-items-center tw-flex tw-flex-row tw-flex-nowrap tw-mg-x-1 tw-mg-y-05',
				[
					e('div', {
						className: 'ffz-channel-avatar',
					}, e('img', {
						src: inst.props.viewerCount.profileImageURL,
						alt: inst.props.channelName
					})),
					e('p', {
						className: 'tw-ellipsis tw-flex-grow-1 tw-mg-l-1 tw-font-size-5',
						textContent: inst.props.channelName
					})
				]
			))
		);

		// Hosting Channels Header
		simplebarContentChildren.push(
			e('p', {
				className: 'tw-pd-t-05 tw-pd-x-1 tw-c-text-alt-2',
				textContent: this.i18n.t('directory.hosting', 'Hosting Channels')
			})
		);

		// Hosting Channels Content
		for (let i = 0; i < hostData.nodes.length; i++) {
			const node = hostData.nodes[i];
			simplebarContentChildren.push(
				e('a', {
					className: 'tw-interactable',
					href: `/${node.login}`,
					onclick: event => this.parent.hijackUserClick(event, node.login, this.destroyHostMenu.bind(this))
				}, e('div', 'tw-align-items-center tw-flex tw-flex-row tw-flex-nowrap tw-mg-x-1 tw-mg-y-05',
					[
						e('div', {
							className: 'ffz-channel-avatar',
						}, e('img', {
							src: node.profileImageURL,
							alt: node.displayName
						})),
						e('p', {
							className: 'tw-ellipsis tw-flex-grow-1 tw-mg-l-1 tw-font-size-5',
							textContent: node.displayName
						})
					]
				))
			);
		}

		this.hostMenu = e('div', 'ffz-host-menu tw-balloon tw-block',
			e('div', 'tw-border tw-elevation-1 tw-border-radius-small tw-c-background',
				e('div', {
					className: 'scrollable-area',
					'data-simplebar': true,
				}, e('div', 'simplebar-scroll-content',
					e('div', 'simplebar-content', simplebarContentChildren)
				))
			)
		);

		const root = (document.body.querySelector('.twilight-root') || document.body);
		root.appendChild(this.hostMenu);

		this.hostMenuPopper = new Popper(document.body, this.hostMenu, {
			placement: 'bottom-start',
			modifiers: {
				flip: {
					enabled: false
				},
				offset: {
					offset: `${event.clientX - 60}, ${event.clientY - 60}`
				}
			},
		});

		this.hostMenuBuffer = Date.now() + 50;
	}

	updateChannelCard(inst) {
		const container = this.fine.getHostNode(inst),
			card = container && container.querySelector && container.querySelector('.tw-card');

		if ( ! card )
			return;

		const hosting = inst.props.channelNameLinkTo.state.content === 'live_host' && this.hosts && this.hosts[inst.props.channelName],
			data = {
				login: hosting ? this.hosts[inst.props.channelName].channel : inst.props.linkTo.pathname.substr(1),
				displayName: inst.props.channelName,
				profileImageURL: inst.props.viewerCount && inst.props.viewerCount.profileImageURL
			};

		this.parent.updateUptime(inst, 'props.viewerCount.createdAt', '.tw-card .tw-aspect > div');
		this.parent.addCardAvatar(inst, 'props.viewerCount', '.tw-card', data);

		if (inst.props.streamType === 'rerun')
			container.parentElement.classList.toggle('tw-hide', this.settings.get('directory.hide-vodcasts'));

		if ( hosting && this.settings.get('directory.following.group-hosts') ) {
			const host_data = this.hosts[data.displayName];

			const title_link = card.querySelector('a[data-a-target="live-channel-card-title-link"]'),
				thumbnail_link = card.querySelector('a[data-a-target="live-channel-card-thumbnail-link"]'),
				card_title = card.querySelector('.live-channel-card__title'),

				text_content = host_data.channels.length !== 1 ?
					this.i18n.t('host-menu.multiple', '%{count} hosting %{channel}', {
						count: host_data.channels.length,
						channel: data.displayName
					}) : inst.props.title;

			if ( card_title )
				card_title.textContent = card_title.title = text_content;

			if ( title_link )
				title_link.addEventListener('click', this.showHostMenu.bind(this, inst, host_data));

			if ( thumbnail_link ) {
				thumbnail_link.title = text_content;
				thumbnail_link.addEventListener('click', this.showHostMenu.bind(this, inst, host_data));
			}
		}
	}
}