module.exports = function (options) {
    // If there's only a single bundle, it will be an id of 0, which will default to ''.
    let bundleId = options.bundleId;
    let hotGlobal = `window.__hot${bundleId}`;

    return {
        nollupBundleInit () {
            return `
                ${hotGlobal} = {
                    status: 'idle',
                    options: ${JSON.stringify(options)},
                    statusHandlers: [],
                    dataCache: {}
                };

                var ws = new WebSocket('ws://' + ${options.hmrHost? `"${options.hmrHost}"` : 'window.location.host'} + '/__hmr${bundleId}');

                function verboseLog() {
                    if (!${hotGlobal}.options.verbose) {
                        return;
                    }

                    console.log.apply(console, ['[HMR]'].concat(Array.prototype.slice.call(arguments)));
                }

                function setHotStatus (status) {
                    verboseLog('Status Change', status);
                    ${hotGlobal}.status = status;
                    ${hotGlobal}.statusHandlers.forEach(function (handler) {
                        handler(status);
                    });
                }

                function getDiposableAcceptableModules (id) {
                    var instanceIds = Object.keys(instances).map(k => parseInt(k));
                    var disposable = [id];
                    var toCheck = [id];
                    var acceptable = [];

                    if (instances[id].hot._accept) {
                        acceptable.push(id);
                    }

                    if (acceptable.length === 0) {
                        while (toCheck.length) {
                            var c = toCheck.pop();

                            instanceIds.forEach(function (instanceId) {
                                if (instances[instanceId].dependencies.indexOf(c) > -1) {
                                    if (!instances[instanceId].hot._accept) {
                                        if (disposable.indexOf(instanceId) === -1) {
                                            toCheck.push(instanceId);
                                        }
                                    } else if (acceptable.indexOf(instanceId) === -1) {
                                        acceptable.push(instanceId);
                                    }
                                    
                                    if (disposable.indexOf(instanceId) === -1) {
                                        disposable.push(instanceId);
                                    }
                                }
                            });
                        }
                    }

                    if (acceptable.length === 0) {
                        return { acceptable: [], disposable: [] };
                    }

                    return { acceptable: acceptable, disposable: disposable };
                }

                function hmrDisposeCallback (disposable) {
                    disposable.forEach(function (id) {
                        instances[id].invalidate = true;

                        let data = {};
                        if (instances[id] && instances[id].hot._dispose) {
                            instances[id].hot._dispose(data);
                        }
                        ${hotGlobal}.dataCache[id] = data;
                    });
                }

                function hmrAcceptCallback (acceptable) {
                    acceptable.forEach(function (id) {
                        if (instances[id] && instances[id].hot._accept) {
                            instances[id].hot._accept();
                        }
                    });
                }

                ws.onmessage = function (e) {
                    var hot = JSON.parse(e.data);

                    if (hot.greeting) {
                        verboseLog('Enabled');
                    }

                    if (hot.status) {
                        setHotStatus(hot.status);
                    }

                    if (hot.changes) {
                        verboseLog('Changes Received');

                        hot.changes.forEach(function (change) {
                            setHotStatus('dispose');
                            var mods = getDiposableAcceptableModules(change.id);
                            hmrDisposeCallback(mods.disposable);

                            if (!change.removed) {
                                setHotStatus('apply');
                                modules[change.id] = eval('(' + change.code + ')');
                                hmrAcceptCallback(mods.acceptable);
                            }
                        });

                        setHotStatus('idle');
                    }
                };
            `;
        },

        nollupModuleInit () {
            return `
                module.hot = {
                    data: ${hotGlobal}.dataCache[module.id] || undefined,

                    accept: function (callback) {
                        this._accept = callback;
                    },

                    dispose: function (callback) {
                        this._dispose = callback;
                    },

                    status: function() {
                        return ${hotGlobal}.status;
                    },

                    addStatusHandler: function(callback) {
                        ${hotGlobal}.statusHandlers.push(callback);
                    },

                    removeStatusHandler: function(callback) {
                        var callbackIndex = ${hotGlobal}.statusHandlers.indexOf(callback);
                        if (callbackIndex > -1) {
                            ${hotGlobal}.statusHandlers.splice(callbackIndex, 1);
                        }
                    }
                };
            `;
        }
    };
}
