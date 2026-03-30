/* Route Fetcher
 * Fetches real-time departure predictions from the 511.org SIRI StopMonitoring API.
 * Stores absolute arrival timestamps so times count down naturally between API polls.
 * A local tick broadcasts updated relative minutes every 30s.
 *
 * attribute stop_id number - The stop code for the transit stop.
 * attribute token string - 511.org API key.
 * attribute reloadInterval number - Reload interval in milliseconds.
 */

var https = require("https");
var zlib = require("zlib");

var TICK_INTERVAL = 30 * 1000; // broadcast updated minutes every 30s

var RouteFetcher = function (stop_id, token, reloadInterval) {
	console.log("Creating route fetcher for stop id: " + stop_id);

	var self = this;
	if (reloadInterval < 1000) {
		reloadInterval = 1000;
	}

	var reloadTimer = null;
	var tickTimer = null;
	this.stop_id = stop_id;
	this.token = token;
	this.debug = false;
	this.arrivalTimestamps = []; // absolute epoch-ms of each expected arrival

	var fetchFailedCallback = function () {};
	var itemsReceivedCallback = function () {};

	// Prune past arrivals and compute minutes-from-now
	function computeMinutes() {
		var now = Date.now();
		// Remove arrivals that have passed
		self.arrivalTimestamps = self.arrivalTimestamps.filter(function (ts) {
			return ts >= now - 30000; // keep "now" arrivals for up to 30s
		});
		return self.arrivalTimestamps.map(function (ts) {
			return Math.max(0, Math.round((ts - now) / 60000));
		});
	}

	function broadcastTimes() {
		var minutes = computeMinutes();
		self.log("Broadcasting " + minutes.length + " times for stop " + self.stop_id);
		itemsReceivedCallback(self);
	}

	this.scheduleTimer = function () {
		clearInterval(reloadTimer);
		reloadTimer = setInterval(function () {
			self.fetchRoute();
		}, reloadInterval);

		// Start the local countdown tick
		clearInterval(tickTimer);
		tickTimer = setInterval(function () {
			if (self.arrivalTimestamps.length > 0) {
				broadcastTimes();
			}
		}, TICK_INTERVAL);
	};

	this.setReloadInterval = function (interval) {
		if (interval > 1000 && interval < reloadInterval) {
			reloadInterval = interval;
		}
	};

	this.onReceive = function (callback) {
		itemsReceivedCallback = callback;
	};

	this.onError = function (callback) {
		fetchFailedCallback = callback;
	};

	this.getStopId = function () {
		return this.stop_id;
	};

	this.getToken = function () {
		return this.token;
	};

	this.setDebug = function (debug) {
		this.debug = debug;
	};

	this.getDepartureTimes = function () {
		var minutes = computeMinutes();
		self.log("Getting departure_times for stop " + self.stop_id);
		self.log(minutes);
		return minutes;
	};

	this.log = function (message) {
		if (this.debug) {
			console.log(message);
		}
	};

	this.fetchRoute = function () {
		self.log("Fetching route for stop id " + this.getStopId());

		var url =
			"https://api.511.org/transit/StopMonitoring" +
			"?api_key=" + encodeURIComponent(this.getToken()) +
			"&agency=SF" +
			"&stopCode=" + this.getStopId() +
			"&format=json";

		https
			.get(url, function (response) {
				var chunks = [];

				response.on("data", function (chunk) {
					chunks.push(chunk);
				});

				response.on("end", function () {
					try {
						var buffer = Buffer.concat(chunks);

						// Decompress if gzip
						var encoding = response.headers["content-encoding"];
						if (encoding === "gzip") {
							buffer = zlib.gunzipSync(buffer);
						} else if (encoding === "deflate") {
							buffer = zlib.inflateSync(buffer);
						}

						// 511.org returns a UTF-8 BOM, strip it
						var raw = buffer.toString("utf8");
						if (raw.charCodeAt(0) === 0xfeff) {
							raw = raw.slice(1);
						}

						var data = JSON.parse(raw);
						var visits =
							data.ServiceDelivery &&
							data.ServiceDelivery.StopMonitoringDelivery &&
							data.ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit;

						if (!visits || !Array.isArray(visits) || visits.length === 0) {
							self.log("No visits from API for stop " + self.getStopId() + ", keeping cached times");
							// Don't clear — let cached timestamps keep counting down
							broadcastTimes();
							return;
						}

						var now = Date.now();
						var newTimestamps = [];

						visits.forEach(function (visit) {
							var call = visit.MonitoredVehicleJourney && visit.MonitoredVehicleJourney.MonitoredCall;
							if (!call) return;

							var arrivalStr = call.ExpectedArrivalTime || call.AimedArrivalTime;
							if (!arrivalStr) return;

							var arrivalMs = new Date(arrivalStr).getTime();
							if (arrivalMs >= now - 30000) {
								newTimestamps.push(arrivalMs);
							}
						});

						newTimestamps.sort(function (a, b) {
							return a - b;
						});

						self.arrivalTimestamps = newTimestamps;

						self.log("Updated timestamps for stop " + self.getStopId() + ": " +
							newTimestamps.map(function (ts) {
								return Math.round((ts - now) / 60000) + "m";
							}).join(", "));
					} catch (e) {
						console.error(
							"Error parsing response for stop_id " +
								self.getStopId() + ": " + e.message +
								" — keeping cached times"
						);
						// Don't clear on parse error either
					}

					broadcastTimes();
				});
			})
			.on("error", function (e) {
				console.error("Network error for stop " + self.getStopId() + ": " + e.message + " — keeping cached times");
				// Broadcast cached times so display stays populated
				broadcastTimes();
				fetchFailedCallback(self, e);
			});
	};
};

module.exports = RouteFetcher;
