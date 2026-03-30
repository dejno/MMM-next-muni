Module.register("nextmuni", {
	defaults: {
		token: "",
		routes: [],
		maxTimesForDisplay: 3,
		animationSpeed: 2 * 1000,
		debug: false
	},

	times: [],

	start: function () {
		this.log("Starting Module: " + this.name);
		this.loaded = false;
		this.broadcastConfig();
		this.registerRoutes();
	},

	socketNotificationReceived: function (notification, payload) {
		this.log("socket notification received: " + notification);
		if (notification === "UPDATED_TIMES") {
			this.log("Received updated times");
			this.updateTimes(payload);
		}
	},

	getDom: function () {
		var wrapper = document.createElement("div");
		wrapper.className = "nextmuni";

		if (!this.loaded) {
			wrapper.innerHTML = '<div class="nextmuni-loading dimmed light small">Loading transit times\u2026</div>';
			return wrapper;
		}

		var table = document.createElement("table");
		table.className = "nextmuni-table small";

		for (var i = 0; i < this.config.routes.length; i++) {
			var route = this.config.routes[i];
			var stop_id = route.stop_id;
			var label = route.label;
			var type = route.type || "bus";
			var emoji = type === "rail" ? "\uD83D\uDE83" : "\uD83D\uDE8C"; // 🚃 or 🚌

			var tr = document.createElement("tr");

			// Emoji cell
			var tdEmoji = document.createElement("td");
			tdEmoji.className = "nextmuni-emoji";
			tdEmoji.textContent = emoji;
			tr.appendChild(tdEmoji);

			// Label cell
			var tdLabel = document.createElement("td");
			tdLabel.className = "nextmuni-label bright";
			tdLabel.textContent = label;
			tr.appendChild(tdLabel);

			// Times cell
			var tdTimes = document.createElement("td");
			tdTimes.className = "nextmuni-times light";

			if (stop_id in this.times && this.times[stop_id].length > 0) {
				var display_times = this.times[stop_id].slice(0, this.config.maxTimesForDisplay);
				var formatted = display_times.map(function (m) {
					return m === 0 ? "now" : m + "m";
				});
				tdTimes.textContent = formatted.join(", ");
			} else {
				tdTimes.textContent = "—";
				tdTimes.classList.add("dimmed");
			}

			tr.appendChild(tdTimes);
			table.appendChild(tr);
		}

		wrapper.appendChild(table);
		return wrapper;
	},

	getStyles: function () {
		return [this.file("nextmuni.css")];
	},

	broadcastConfig: function () {
		this.sendSocketNotification("SET_CONFIG", this.config);
	},

	registerRoutes: function () {
		for (var r = 0; r < this.config.routes.length; r++) {
			var route = this.config.routes[r];
			this.log("Adding route");
			this.log(route);
			this.sendSocketNotification("ADD_ROUTE", {
				route: route,
				config: this.config
			});
		}
	},

	updateTimes: function (times) {
		this.times = times;
		this.loaded = true;
		this.updateDom(this.config.animationSpeed);
	},

	log: function (message) {
		if (this.config.debug) {
			Log.log(message);
		}
	}
});
