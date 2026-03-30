/* Route Fetcher
 * Fetches real-time departure predictions from the 511.org SIRI StopMonitoring API.
 *
 * attribute stop_id number - The stop code for the transit stop.
 * attribute token string - 511.org API key.
 * attribute reloadInterval number - Reload interval in milliseconds.
 */

var https = require("https");
var zlib = require("zlib");

var RouteFetcher = function (stop_id, token, reloadInterval) {
	console.log("Creating route fetcher for stop id: " + stop_id);

	var self = this;
	if (reloadInterval < 1000) {
		reloadInterval = 1000;
	}

	var reloadTimer = null;
	this.stop_id = stop_id;
	this.token = token;
	this.debug = false;
	this.departure_times = [];

	var fetchFailedCallback = function () {};
	var itemsReceivedCallback = function () {};

	this.scheduleTimer = function () {
		clearInterval(reloadTimer);
		reloadTimer = setInterval(function () {
			self.fetchRoute();
		}, reloadInterval);
	};

	this.setReloadInterval = function (interval) {
		if (interval > 1000 && interval < reloadInterval) {
			reloadInterval = interval;
		}
	};

	function broadcastTimes() {
		self.log("Broadcasting " + self.departure_times.length + " times.");
		itemsReceivedCallback(self);
	}

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
		self.log("Getting departure_times");
		self.log(self.departure_times);
		return self.departure_times;
	};

	this.log = function (message) {
		if (this.debug) {
			console.log(message);
		}
	};

	this.logError = function (message) {
		if (this.debug) {
			console.error(message);
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

						if (!visits || !Array.isArray(visits)) {
							self.log("No visits found for stop " + self.getStopId());
							self.departure_times = [];
							broadcastTimes();
							return;
						}

						var now = new Date();
						self.departure_times = [];

						visits.forEach(function (visit) {
							var call = visit.MonitoredVehicleJourney && visit.MonitoredVehicleJourney.MonitoredCall;
							if (!call) return;

							var arrivalStr = call.ExpectedArrivalTime || call.AimedArrivalTime;
							if (!arrivalStr) return;

							var arrivalTime = new Date(arrivalStr);
							var minutes = Math.round((arrivalTime - now) / 60000);

							if (minutes >= 0) {
								self.departure_times.push(minutes);
							}
						});

						self.departure_times.sort(function (a, b) {
							return a - b;
						});

						self.log("Departure Times for stop " + self.getStopId() + ":");
						self.log(self.departure_times);
					} catch (e) {
						console.error(
							"There was an error getting times for stop_id " +
								self.getStopId() +
								": " +
								e.message
						);
						self.departure_times = [];
					}

					broadcastTimes();
				});
			})
			.on("error", function (e) {
				console.error("Got error fetching stop " + self.getStopId() + ": " + e.message);
				fetchFailedCallback(self, e);
			});
	};
};

module.exports = RouteFetcher;
