/**
 * 
 *
 * @return
 */

(function(factory) {
    
    'use strict';

    if (typeof define === 'function') {
        define(factory);
    } else {
        window.PostChannel = factory;
    }

}(function(require) {
    
    var isLiteral = function(obj) {
        return (typeof obj === 'object' && obj.constructor !== Array);
    };

    return function(config) {

        var _this = this,
            _postChannel = {};

        this.name = window.location;
        this.window = window;

        /* 
        * Bind targets; Hash of targets;
        * Key is target name
        * references target window and target origin
        */
        this.target = {};

        // Set a scope for message posts (optional)
        this.scope = null;

        // Set origin
        this.origin = null;

        var getRandomInt = function(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };

        // Internal Cache
        _postChannel.messageQueue = {};

        // Bound Events 
        _postChannel.events = {};

        // Internal setScope
        _postChannel.setScope = function(scope) {
            scope = scope ? window[scope] : window;
            scope._postMessages = {};
            return scope._postMessages;
        };

        // Internal init
        _postChannel.open = function(config) {

            config = config || {};
            
            _this.origin = config.origin || '*';
            _postChannel.bindInitialEvents();
            _postChannel.attachTarget(config.target);
            _postChannel.listen();

            if (config.scope) {
                _this.scope = setScope(config.scope);
            }
            
        };
            
        // Attach child frame
        _postChannel.attachTarget = function(target) {
            if (target) {
                _this.target = target;
                _this.post('connect');
            } else {
                _this.target = null;
            }
        };

        // Bind Arbitrary Post Types
        _postChannel.bind = function(type, fn, args) {
            args = args || [];
            var handler = {
                    fn: fn,
                    args: args
                };
            
            if (!this.events.hasOwnProperty(type)) {
                this.events[type] = [];
            }

            this.events[type].push(handler);

            return _this;
        };

        // Unbind Post Types
        _postChannel.unbind = function(type) {
            delete this.events[type];
            return _this;
        };

        _postChannel.bindInitialEvents = function() {
            this.bind('connect', function(evt, payload) {
                _this.target = evt.source;
                _this.origin = evt.origin;
                window.evt = evt;
            });
            
            this.bind('post', function(evt, payload) {
            });

            this.bind('response', function(evt, payload) {
                _postChannel.resolvePost(evt, payload);
            });
        };

        // Internal post
        _postChannel.post = function(targetWindow, payload, targetOrigin) {
            payload = JSON.stringify(payload);
            targetWindow.postMessage(payload, targetOrigin);
        };

        _postChannel.listen = function(config) {
        
            config = config || {};

            var success = config.success || function() {},
                verifyOrigin = config.verifyOrigin;

            var callback = function(evt) {

                if (verifyOrigin && evt.origin !== _this.target) {
                    throw new Error('Origin is not valid');
                }
                
                var payload = JSON.parse(evt.data),

                    // TODO do something with success callback on line 127
                    args = [evt, payload],
                    type = _postChannel.events.hasOwnProperty(payload.type) ? payload.type : 'post',
                    suppressResponse = payload.suppressResponse || false,
                    eventsArray = _postChannel.events[type],
                    appliedArgs,
                    handler, 
                    fn,
                    max = eventsArray.length,
                    i;

                for (i = 0; i < max; i++) {
                    handler = eventsArray[i];
                    fn = handler.fn;
                    appliedArgs = args.concat(handler.args); 
                    fn.apply(_this, appliedArgs);
                }

                if (type !== 'response' && !suppressResponse) {
                    _postChannel.sendResponse.apply(_this, [evt, payload, success]);
                }

                return _this;
            };

            _this.window.addEventListener("message", callback, false);
        };

        _postChannel.queueMessage = function(/*promise,*/payload, success) {
            
            var id = getRandomInt(11111, 99999),
                postDefer = null;

            payload._id = id;
            
            var postPromise = function(post) {
                return $.Deferred(function(defer) {
                    postDefer = defer;
                    post();
                });
            };

            postPromise(function() {
                _postChannel.post(_this.target, payload, _this.origin);
            }).then(function(evt, response) {
                if (success) success.call(_this.window);
            });

            _postChannel.messageQueue[id] = {
                promise: postDefer,
                originalPayload: payload
            };

            // if suppressing response, need to immediately remove
            // current message from queue, otherwise it never will be
            if (payload.suppressResponse) {
                _postChannel.resolvePost(null, payload);
            }

            //return id;
        };

        _postChannel.resolveMessageQueueItem = function(id) {
            
            var messageItem; 
            
            if (this.messageQueue.hasOwnProperty(id)) {
                messageItem = this.messageQueue[id];
                delete this.messageQueue[id];
                return messageItem;
            } else {
                throw new Error('No Message to Resolve');
            }
        };

        _postChannel.resolvePost = function(evt, data) {
            var post = this.resolveMessageQueueItem(data._id);
            post.promise.resolve(evt, data, post.originalPayload);
        };

        _postChannel.sendResponse = function(evt, payload, success) {
            var target = evt.source,
                targetOrigin = evt.origin,
                newPayload = {
                    type: 'response',
                    _id: payload._id,
                    originalPayload: payload,
                    originalType: payload.type
                };

            _postChannel.post(target, newPayload, targetOrigin);

            if (payload.type === 'connect') {
                this.execute('connected');
            }
            //success.call(_this.window, payload, evt);
            
        };

        /*
        // Set Property on target window
        this.set = function(type, property, target) {
        };

        // Set Method on target window
        this.setMethod = function() {
        };
        */
        
        // Get Property on target window
        this.get = function(type, cb) {
            
            var _this = this;
            
            cb = (cb && typeof cb === 'function') ? cb : function() {};

            this.bind(type, function(evt, payload) {
                cb.call(_this, evt, payload);
            });

            this.execute(type);
            
        };

        this.reveal = function(type, payload) {

            var _this = this;

            this.bind(type, function() {
                _this.post(type, {data: payload});
            });
            
        };

        // Post Message to targets; 
        this.post = function(type, payload) {

            payload = (payload && isLiteral(payload)) ? payload : {};
            payload.type = type;
            
            var success = payload.success;

            _postChannel.queueMessage(payload, success);

        };

        this.execute = function(type, arg) {
            var payload = {};

            payload.type = type;
            payload.data = arg;
            payload.suppressResponse = true;
            
            _postChannel.queueMessage(payload);
        };
        
        // Listen to Post Messages
        this.listen = function(config) {
            _postChannel.listen(config); 
        };

        this.bind = function(type, fn, args) {
            _postChannel.bind(type, fn, args);
        };

        // Init with config
        _postChannel.open(config);
    };
    
}));





