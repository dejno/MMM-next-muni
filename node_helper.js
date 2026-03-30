var NodeHelper = require("node_helper");
var RouteFetcher = require("./route_fetcher.js");

module.exports = NodeHelper.create({
    config: {},

    start: function() {
        this.log("Starting module: " + this.name);
        this.fetchers = [];
    },

    // Subclass socketNotificationReceived received.
    socketNotificationReceived: function(notification, payload) {
        this.log('Next Muni sockeet notification received: ' + notification);
        if (notification === 'SET_CONFIG') {
            this.config = payload;
            return;
        }

        if (notification === "ADD_ROUTE") {
            this.createRouteFetcher(payload.route, payload.config);
            return;
        }
    },

    /* createRouteFetcher(feed, reloadInterval)
     * Creates a fetcher for a new route if it doesn't exist yet.
     *
     * attribute feed object - {stop_id: STOP_ID, label: 'Label'}
     * attribute reloadInterval number - Reload interval in milliseconds.
     */

    createRouteFetcher: function(route, config) {
        var self = this;
        this.log('some damn route:');
        this.log(route);
        var stop_id = route.stop_id || "";
        var label = route.label || "";
        var token = config.token;
        var reloadInterval = config.reloadInterval || 60 * 1000;

        if (!label || !stop_id || !token) {
            self.sendSocketNotification("INVALID_PARAMS", 'label, stop_id, and valid token are all required');
            return;
        }

        var fetcher;
        if (typeof self.fetchers[stop_id] === "undefined") {
            self.log("Create new route fetcher for stop_id: " + stop_id + " - Interval: " + reloadInterval);
            fetcher = new RouteFetcher(stop_id, token, reloadInterval);

            fetcher.setDebug(self.config.debug);

            fetcher.onReceive(function(fetcher) {
                self.log('Received for ' + fetcher.getStopId());
                self.broadcastRoutes();
            });

            fetcher.onError(function(fetcher, error) {
                self.sendSocketNotification("FETCH_ERROR", {
                    stop_id: fetcher.getStopId(),
                    error: error
                });
            });

            self.fetchers[stop_id] = fetcher;
        } else {
            self.log("Use existing news fetcher for stop_id: " + stop_id);
            fetcher = self.fetchers[stop_id];
            self.broadcastRoutes();
        }

        fetcher.fetchRoute();
        fetcher.scheduleTimer();
    },

    /* broadcastFeeds()
     * Creates an object with all feed items of the different registered feeds,
     * and broadcasts these using sendSocketNotification.
     */
    broadcastRoutes: function() {
        var times = {};
        for (var f in this.fetchers) {
            times[f] = this.fetchers[f].getDepartureTimes();
        }

        this.sendSocketNotification("UPDATED_TIMES", times);
    },

    log: function(message) {
        if (this.config.debug) {
            console.log(message);
        }
    }
});
