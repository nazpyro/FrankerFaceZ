var FFZ = window.FrankerFaceZ,
	constants = require("../constants"),

	TWITCH_BASE = "http://static-cdn.jtvnw.net/emoticons/v1/",
	BANNED_SETS = {"00000turbo":true},


	get_emotes = function(ffz) {
		var Chat = App.__container__.lookup('controller:chat'),
			room_id = Chat.get('currentRoom.id'),
			room = ffz.rooms[room_id],
			tmiSession = room ? room.room.tmiSession : null,

			set_ids = tmiSession && tmiSession._emotesParser && tmiSession._emotesParser.emoticonSetIds || "0",
			user = ffz.get_user(),
			user_sets = user && ffz.users[user.login] && ffz.users[user.login].sets || [];

		// Remove the 'default' set.
		set_ids = set_ids.split(",").removeObject("0")

		return [set_ids, user_sets];
	};


// -------------------
// Initialization
// -------------------

FFZ.prototype.setup_my_emotes = function() {
	this._twitch_emote_sets = {};
	this._twitch_set_to_channel = {};

	if ( localStorage.ffzTwitchSets ) {
		try {
			this._twitch_set_to_channel = JSON.parse(localStorage.ffzTwitchSets);
		} catch(err) { }
	}
}


// -------------------
// Menu Page
// -------------------

FFZ.menu_pages.my_emotes = {
	name: "My Emoticons",
	icon: constants.EMOTE,

	visible: function() {
		var emotes = get_emotes(this);
		return emotes[0].length > 0 || emotes[1].length > 0;
	},

	render: function(view, container) {
			var emotes = get_emotes(this), f = this;

			new RSVP.Promise(function(done) {
				var needed_sets = [];
				for(var i=0; i < emotes[0].length; i++) {
					var set_id = emotes[0][i];
					if ( ! f._twitch_emote_sets[set_id] )
						needed_sets.push(set_id);
				}

				RSVP.all([
					new RSVP.Promise(function(d) {
						if ( ! needed_sets.length )
							return d();

						Twitch.api.get("chat/emoticon_images", {emotesets: needed_sets.join(",")}, {version: 3})
							.done(function(data) {
								if ( data.emoticon_sets ) {
									for(var set_id in data.emoticon_sets) {
										if ( ! data.emoticon_sets.hasOwnProperty(set_id) )
											continue;

										var set = f._twitch_emote_sets[set_id] = f._twitch_emote_sets[set_id] || {};
										set.emotes = data.emoticon_sets[set_id];
										set.source = "Twitch";
									}
								}
								d();
							}).fail(function() {
								d();
							});
					}),
					new RSVP.Promise(function(d) {
						if ( ! needed_sets.length )
							return d();

						var promises = [],
							old_needed = needed_sets,
							handle_set = function(id, name) {
								var set = f._twitch_emote_sets[id] = f._twitch_emote_sets[id] || {};

								if ( !name || BANNED_SETS[name] )
									return;

								if ( name == "turbo" ) {
									set.channel = "Twitch Turbo";
									set.badge = "//cdn.frankerfacez.com/script/turbo_badge.png";
									return;
								}

								// Badge Lookup
								promises.push(new RSVP.Promise(function(set, name, dn) {
									Twitch.api.get("chat/" + name + "/badges", null, {version: 3})
										.done(function(data) {
											if ( data.subscriber && data.subscriber.image )
												set.badge = data.subscriber.image;
											dn();
										}).fail(dn)}.bind(this,set,name)));

								// Mess Up Capitalization
								var lname = name.toLowerCase(),
									old_data = FFZ.capitalization[lname];
								if ( old_data && Date.now() - old_data[1] < 3600000 ) {
									set.channel = old_data[0];
									return;
								}

								promises.push(new RSVP.Promise(function(set, lname, name, dn) {
									if ( ! f.ws_send("get_display_name", lname, function(success, data) {
										var cap_name = success ? data : name;
										FFZ.capitalization[lname] = [cap_name, Date.now()];
										set.channel = cap_name;
										dn();
									}) ) {
										// Can't use socket.
										set.channel = name;
										dn();
									}

									// Timeout
									setTimeout(function(set,name,dn) {
										if ( ! set.channel )
											set.channel = name;
										dn();
									}.bind(this,set,name,dn), 5000);
								}.bind(this, set, lname, name)));
							},
							handle_promises = function() {
								if ( promises.length )
									RSVP.all(promises).then(d,d);
								else
									d();
							};

						// Process all the sets we already have.
						needed_sets = [];
						for(var i=0;i<old_needed.length;i++) {
							var set_id = old_needed[i];
							if ( f._twitch_set_to_channel[set_id] )
								handle_set(set_id, f._twitch_set_to_channel[set_id]);
							else
								needed_sets.push(set_id);
						}

						if ( needed_sets.length > 0 ) {
							f.ws_send("twitch_sets", needed_sets, function(success, data) {
								needed_sets = [];
								if ( success ) {
									for(var set_id in data) {
										if ( ! data.hasOwnProperty(set_id) )
											continue;

										f._twitch_set_to_channel[set_id] = data[set_id];
										handle_set(set_id, data[set_id]);
									}

									localStorage.ffzTwitchSets = JSON.stringify(f._twitch_set_to_channel);
								}

								handle_promises();
							});

							// Timeout!
							setTimeout(function() {
								if ( needed_sets.length )
									handle_promises();
								}, 5000);

						} else
							handle_promises();
					})
				]).then(function() {
					var sets = {};
					for(var i=0; i < emotes[0].length; i++) {
						var set_id = emotes[0][i];
						if ( f._twitch_emote_sets[set_id] )
							sets[set_id] = f._twitch_emote_sets[set_id];
					}
					done(sets);
				}, function() { done({}); })
			}).then(function(twitch_sets) {
				try {

				// Don't override a different page. We can wait.
				if ( container.getAttribute('data-page') != "my_emotes" )
					return;

				container.innerHTML = "";

				var ffz_sets = {},
					sets = [];

				for(var set_id in twitch_sets) {
					if ( ! twitch_sets.hasOwnProperty(set_id) )
						continue;

					var set = twitch_sets[set_id];
					if ( set.channel && set.emotes && set.emotes.length )
						sets.push([1, set.channel, set]);
				}

				sets.sort(function(a,b) {
					if ( a[0] < b[0] ) return -1;
					else if ( a[0] > b[0] ) return 1;

					var an = a[1].toLowerCase(),
						bn = b[1].toLowerCase();

					if ( an === "twitch turbo" )
						an = "zzz" + an;

					if ( bn === "twitch turbo" )
						bn = "zzz" + bn;

					if ( an < bn ) return -1;
					else if ( an > bn ) return 1;
					return 0;
				});

				for(var i=0; i < sets.length; i++) {
					var set = sets[i][2],
						heading = document.createElement('div'),
						menu = document.createElement('div');

					heading.className = 'heading';
					heading.innerHTML = '<span class="right">' + set.source + '</span>' + FFZ.get_capitalization(set.channel);
					if ( set.badge )
						heading.style.backgroundImage = 'url("' + set.badge + '")';

					menu.className = 'emoticon-grid';
					menu.appendChild(heading);

					for(var x=0; x < set.emotes.length; x++) {
						var emote = set.emotes[x];

						var s = document.createElement('span');
						s.className = 'emoticon tooltip';
						s.style.backgroundImage = 'url("' + TWITCH_BASE + emote.id + '/1.0")';

						var img_set = 'image-set(url("' + TWITCH_BASE + emote.id + '/1.0") 1x, url("' + TWITCH_BASE + emote.id + '/2.0") 2x, url("' + TWITCH_BASE + emote.id + '/3.0") 4x)';
						s.style.backgroundImage = '-webkit-' + img_set;
						s.style.backgroundImage = '-moz-' + img_set;
						s.style.backgroundImage = '-ms-' + img_set;
						s.style.backgroundImage = img_set;

						s.title = emote.code;
						s.addEventListener('click', f._add_emote.bind(f, view, emote.code));
						menu.appendChild(s);
					}

					container.appendChild(menu);
				}

				if ( ! sets.length ) {
					var menu = document.createElement('div');

					menu.className = 'chat-menu-content center';
					menu.innerHTML = "Error Loading Subscriptions";

					container.appendChild(menu);
				}

				} catch(err) {
					f.log("My Emotes Menu Error", err);
					container.innerHTML = "";

					var menu = document.createElement('div'),
						heading = document.createElement('div'),
						p = document.createElement('p');

					heading.className = 'heading';
					heading.innerHTML = 'Error Loading Menu';
					menu.appendChild(heading);

					p.className = 'clearfix';
					p.textContent = err;
					menu.appendChild(p);

					menu.className = 'chat-menu-content';
					container.appendChild(menu);
				}
			});
		}
	};
