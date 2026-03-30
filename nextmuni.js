Module.register("nextmuni", {
    // Default module config.
    defaults: {
        text: "Next Muni!",
        token: '3d93f7cc-bb3c-45de-bab9-121aba88ddfc',
        routes: [
            /**
             * {
             * 	stop_id: 15194,
             *   label:   'work'
             * }
             */
            {
                stop_id: 13915,
                label: 'To work'
            },
            {
                stop_id: 16995,
                label: "From work"
            },
            {
                stop_id: 17252,
                label: "From Michelle's to home"
            }
        ],
        maxTimesForDisplay: 4,
        animationSpeed: 2 * 1000,
        debug: true
    },

    times: [],

    // Define start sequence.
    start: function() {
        this.log("Starting Module: " + this.name);
        this.loaded = false;
        this.broadcastConfig();
        this.registerRoutes();
    },

    // Override socket notification handler.
    socketNotificationReceived: function(notification, payload) {
        this.log('socket notification received: ' + notification);
        if (notification === "UPDATED_TIMES") {
            this.log('Received updated times');
            this.updateTimes(payload);
        }
    },

    // Override dom generator.
    getDom: function() {
        var wrapper = document.createElement("div");

        var dl = document.createElement('dl');

        this.log('Updating Next Muni Dom with routes:');
        this.log(this.times);

        for (i in this.config.routes) {
            var stop_id = this.config.routes[i].stop_id;
            var label = this.config.routes[i].label;

            var dt = document.createElement('dt');
            var dd = document.createElement('dd');
            dt.innerHTML = label;

            if (stop_id in this.times && this.times[stop_id].length > 0) {
              var display_times = this.times[stop_id].slice(0, this.config.maxTimesForDisplay);
                dd.innerHTML = display_times.join(', ') + ' minutes';
            } else if (this.loaded === false) {
                dd.innerHTML = 'One moment while times load...';
            } else {
                dd.innerHTML = 'No times currently';
            }

            dl.append(dt);
            dl.append(dd);
        }

        wrapper.append(dl);

        return wrapper;
    },

    getStyles: function() {
        return [
            this.file('nextmuni.css')
        ];
    },

    broadcastConfig: function() {
        this.sendSocketNotification("SET_CONFIG", this.config);
    },

    registerRoutes: function() {
        for (var r in this.config.routes) {
            var route = this.config.routes[r];
            this.log('Adding route');
            this.log(route);
            this.sendSocketNotification("ADD_ROUTE", {
                route: route,
                config: this.config
            });
        }
    },

    updateTimes: function(times) {
        this.times = times;
        this.loaded = true;
        this.updateDom(this.config.animationSpeed);
    },

    log: function(message) {
        if (this.config.debug) {
            Log.log(message);
        }
    }
});
