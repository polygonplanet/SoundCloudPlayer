/*
 * SoundCloudPlayer : trappers
 */

/*
 * define ObjectListener/ObjectTrapper/MapTrapper
 */
(function() {

  // WeakMap storage
  var maps = {
    ObjectListener: null,
    ObjectTrapper: null,
    MapTrapper: null
  };


  var definers = {};
  var factories = {};


  // createConstructor() set the identifiable owner name property
  // that is reference of this.constructor.
  // e.g., MapTrapper.prototype.MapTrapper === MapTrapper
  var getIdentifier = function(o) {
    return Object.keys(maps).filter(function(key) {
      return key in o && o instanceof o[key];
    }).shift();
  };


  var getHandler = function(o) {
    return definers[getIdentifier(o)];
  };


  var createCallback = function(type, desc, defaults) {
    return desc[type] && callback(desc[type]) ||
           isFunction(desc.value) && callback(desc.value) || defaults;
  };


  definers.ObjectListener = function(key) {
    var events = this.events;
    var desc = Object.getOwnPropertyDescriptor(events.target, key);

    if (!desc) {
      return false;
    }

    var trap = events.traps[key] || (events.traps[key] = {});
    if (trap.trapped) {
      return true;
    }
    var handlers = events.handlers[key] || (events.handlers[key] = {});

    trap.value = trap.prevValue = trap.originalValue = events.target[key];
    trap.originalDesc = desc;

    // make restorable for clear().
    trap.restore = function() {
      delete events.target[key];

      if (isFunction(trap.originalValue)) {
        events.target[key] = trap.originalValue;
      } else {
        defineProp(events.target, key, trap.originalDesc);

        if (!isFunction(trap.value) && trap.value !== trap.originalValue) {
          events.target[key] = trap.value;
        }
      }
    };

    var getter = createCallback('get', desc, function() { return trap.value; });
    var setter = createCallback('set', desc, function(v) { return trap.value = v; });
    var applier = callback(trap.value);

    var setTrapProperty = function() {
      defineProp(events.target, key, { get: trap.get, set: trap.set });
    };

    var triggerHandlers = function(context, when, value, args) {
      if (handlers[when]) {
        var callbacks = handlers[when];
        for (var i = 0, len = callbacks.length; i < len; i++) {
          value = callbacks[i].call(context, events.target, key, value, args);
        }
      }
      return value;
    };

    // delete oparator can access target[key] without recursive overflow
    var withoutRecursion = function(context, func) {
      delete events.target[key];
      events.target[key] = trap.value = getter();

      try {
        return func.call(context);
      } catch (e) {
        if (e !== withoutRecursion.cancel) {
          throw e;
        }
      } finally {
        setTrapProperty();
      }
    };
    withoutRecursion.cancel = {};

    mixin(trap, {
      get: function() {
        return withoutRecursion(this, function() {
          trap.value = triggerHandlers(this, 'beforeget', trap.value);
          try {
            trap.value = getter();
          } finally {
            return trap.value = triggerHandlers(this, 'get', trap.value);
          }
        });
      },
      set: function(value) {
        return withoutRecursion(this, function() {
          value = triggerHandlers(this, 'beforeset', value);
          try {
            setter(value);
            value = getter();
          } finally {
            value = triggerHandlers(this, 'set', value);

            if (trap.prevValue !== value) {
              value = triggerHandlers(this, 'change', value);
            }
            trap.value = trap.prevValue = value;

            if (isFunction(trap.value)) {
              applier = callback(trap.value);
              events.target[key] = trap.value = trap.applyFn;
              throw withoutRecursion.cancel;
            }
            return trap.value;
          }
        });
      },
      applyFn: function() {
        var value, args = arguments;

        value = triggerHandlers(this, 'beforeapply', value, args);
        try {
          value = applier.apply(this, args);
        } finally {
          return triggerHandlers(this, 'apply', value, args);
        }
      }
    });

    if (isFunction(trap.value)) {
      events.target[key] = trap.applyFn;
    } else {
      setTrapProperty();
    }
    return trap.trapped = true;
  };


  /**
   * Watch object properties.
   * That can notice the method calling and the changed value.
   *
   * @example
   *   var o = { a: 1 };
   *   var listener = new ObjectListener(o);
   *   listener.on('get:a', function(target, key, value) {
   *     return value + 100;
   *   });
   *   o.a = 2;
   *   log(o.a); // 102
   *   o.a = 5;
   *   log(o.a); // 105
   *
   * @example
   *   var o = { a: 'abc' };
   *   var listener = new ObjectListener(o);
   *   listener.on('set:a', function(target, key, value) {
   *     return value + '!!';
   *   });
   *   o.a = 'zzz';
   *   log(o.a); // zzz!!
   *   o.a = 'Hello';
   *   log(o.a); // Hello!!
   *
   * @example
   *   var o = {
   *     value: 1,
   *     func: function(a, b, c) { return this.value + a + b + c }
   *   };
   *   var listener = new ObjectListener(o);
   *   listener.on('apply:func', function(target, key, value, args) {
   *     return value * 1000;
   *   });
   *   var value = o.func(1, 2, 3);
   *   log(value); // 7000
   *
   * @example
   *   var o = { a: 'abc' };
   *   var listener = new ObjectListener(o);
   *   listener.on('change:a', function(target, key, value) {
   *     return 'changed! ' + value;
   *   });
   *   o.a = 'abc';
   *   log(o.a); // abc
   *   o.a = 'zzz';
   *   log(o.a); // changed! zzz
   *   o.a = 'Hello';
   *   log(o.a); // changed! Hello
   *
   * @name ObjectListener
   * @constructor
   * @param {object} target
   */
  var ObjectListener = factories.ObjectListener = createConstructor('ObjectListener', {
    init: function(target) {
      var id = getIdentifier(this);

      if (maps[id] && maps[id].has(target)) {
        this.events = maps[id].get(target);
      } else {
        (maps[id] || (maps[id] = new WeakMap())).set(target, this.events = {
          traps: {},
          target: target,
          handlers: {}
        });
      }
    },
    /**
     * Add a new handler.
     *
     * @param {string} type type of listener/trigger
     *   that separates by a colon. 'when:propName' e.g., 'get:myPropName'
     *
     *   when:
     *     - beforeget   : trigger on before get.
     *     - get         : trigger on get.
     *     - beforeset   : trigger on before set value.
     *     - set         : trigger on set value.
     *     - beforeapply : trigger on before function calls.
     *     - apply       : trigger on function calls.
     *     - change      : trigger on changed value.
     *
     * @param {function} func handler
     *   handler arguments are following.
     *
     *   function(target, key, value, args) { ... }
     *
     *     - target : target object.
     *     - key    : target key.
     *     - value  : value to be returned.
     *     - args   : original function arguments. ('apply' or 'beforeapply')
     *
     * @return {ObjectListener} instance
     */
    on: function(type, func, one = false) {
      var events = this.events;
      var [when, key] = type.split(':');

      if (!hasOwn(events.traps, key)) {
        events.traps[key] = {};
        events.handlers[key] = {};

        if (!getHandler(this).call(this, key)) {
          throw 'Failed to set handler';
        }
      }
      var handlers = events.handlers[key];
      when = when.toLowerCase();

      if (one) {
        func = once(func, this.off.apply.bind(this.off, this, arguments));
      }
      (handlers[when] || (handlers[when] = [])).push(func);
      return this;
    },
    /**
     * Remove a handler.
     *
     * @param {string} type
     * @param {function} [func]
     * @return {ObjectListener} instance
     */
    off: function(type, func = null) {
      var events = this.events;
      var [when, key] = type.split(':');

      var handlers = events.handlers[key];
      if (handlers && handlers[when] && handlers[when].length > 0) {
        if (func == null) {
          handlers[when].length = 0;
        } else {
          handlers[when] = handlers[when].filter(function(fn) {
            return fn !== func;
          });
        }
      }
      return this;
    },
    /**
     * Add a new handler function that will called once.
     *
     * @param {string} type
     * @param {function} func
     * @return {ObjectListener} instance
     */
    once: function(type, func) {
      return this.on(type, func, true);
    },
    /**
     * Clear all of handlers.
     *
     * @return {ObjectListener} instance
     */
    clear: function() {
      var events = this.events;

      forEach(events.traps, function(trap) {
        trap && trap.restore && trap.restore();
      });
      events.trapper && clearObject(events.trapper);
      return clearObject(events.traps), clearObject(events.handlers), this;
    }
  });


  definers.ObjectTrapper = definers.MapTrapper = function(key) {
    var events = this.events;

    var trapper = events.trapper || (events.trapper = {});
    if (trapper.trapped) {
      return true;
    }

    var traps = events.traps;
    var trap = traps[key];

    if (trapper.enableMap) {
      // enableMap is used when target has Map/WeakMap interface.
      trap.value = trap.prevValue = trap.originalValue = events.target.get(key);
    } else {
      trap.value = trap.prevValue = trap.originalValue = events.target[key];
    }

    var triggerTraps = function(when, target, key, value, args) {
      var handlers = events.handlers[key];

      if (handlers && handlers[when]) {
        var callbacks = handlers[when];
        for (var i = 0, len = callbacks.length; i < len; i++) {
          value = callbacks[i].call(target, target, key, value, args);
        }
      }
      return value;
    };

    var hasTrap = function(key) {
      return key in traps && 'value' in traps[key];
    };

    var defaults = {
      get: function(target, name) {
        if (typeof target[name] === 'function') {
          return function() {
            return target[name].apply(target, arguments);
          };
        }
        return target[name];
      },
      set: function(target, name, value) {
        return target[name] = value, true;
      }
    };

    mixin(trapper, {
      applyFn: function(target, name) {
        return function() {
          var value, args = arguments;

          value = triggerTraps('beforeapply', target, name, value, args);
          try {
            value = target[name].apply(target, args);
          } finally {
            return triggerTraps('apply', target, name, value, args);
          }
        };
      },
      applyMap: function(target, name) {
        return function() {
          var args = arguments;
          var [key, value] = args;

          if (hasTrap(key)) {
            var trap = traps[key];

            switch (name) {
              case 'get':
                  trap.value = triggerTraps('beforeget', target, key, trap.value, args);
                  try {
                    trap.value = target.get(key);
                  } finally {
                    return trap.value = triggerTraps('get', target, key, trap.value, args);
                  }
                  break;
              case 'set':
                  value = triggerTraps('beforeset', target, key, value, args);
                  try {
                    return target.set(key, value);
                  } finally {
                    value = triggerTraps('set', target, key, value, args);

                    if (trap.prevValue !== value) {
                      value = triggerTraps('change', target, key, value, args);
                    }
                    target.set(key, trap.value = trap.prevValue = value);
                  }
            }
          }
          return trapper.applyFn(target, name).apply(target, args);
        };
      },
      proxible: {
        get: function(target, name) {
          var isFunc = typeof target[name] === 'function';

          if (trapper.enableMap) {
            if (isFunc) {
              return trapper.applyMap(target, name);
            }
            return defaults.get(target, name);
          }

          if (!hasTrap(name)) {
            return defaults.get(target, name);
          }

          if (isFunc) {
            return trapper.applyFn(target, name);
          }

          var trap = traps[name];

          trap.value = triggerTraps('beforeget', target, name, trap.value);
          try {
            trap.value = target[name];
          } finally {
            return trap.value = triggerTraps('get', target, name, trap.value);
          }
        },
        set: function(target, name, value) {
          if (!hasTrap(name)) {
            return defaults.set(target, name, value);
          }

          value = triggerTraps('beforeset', target, name, value);
          try {
            value = target[name] = value;
          } finally {
            value = triggerTraps('set', target, name, value);

            var trap = traps[name];

            if (trap.prevValue !== value) {
              value = triggerTraps('change', target, name, value);
            }
            return trap.value = trap.prevValue = target[name] = value, true;
          }
        }
      }
    });
    return trapper.trapped = true;
  };


  /**
   * Create a trap proxy to watch object properties
   * That can notice the method calling and the changed value.
   *
   * ObjectTrapper's method usage is same as ObjectListener.
   *
   * @example
   *   var element = document.getElementById('information');
   *   var trapper = new ObjectTrapper(element.style);
   *   trapper.on('change:display', function(target, key, value, args) {
   *     if (value === 'none') {
   *       log('element is hidden');
   *     } else {
   *       log('element is visible');
   *     }
   *     return value;
   *   });
   *   var style = trapper.getTrappedTarget();
   *   style.display = 'none';  // element is hidden
   *   style.display = 'block'; // element is visible
   *
   * @example
   *   var trapper = new ObjectTrapper(Date);
   *   trapper.on('apply:now', function(target, key, value, args) {
   *     if (!args.length) {
   *       return value;
   *     }
   *     var format = args[0];
   *     var template = 'YYYY:MM:DD:HH:mm:ss'.split(':');
   *     return new target().toISOString().split(/[-:.TZ]/).reduce(function(format, item, i) {
   *       return format.replace(template[i], item);
   *     }, format);
   *   });
   *   var MyDate = trapper.getTrappedTarget();
   *   log(MyDate.now());                       // 1386175483943
   *   log(MyDate.now('YYYY-MM-DD'));           // 2013-12-04
   *   log(MyDate.now('MM/DD/YYYY, HH:mm:ss')); // 12/04/2013, 16:44:43
   *
   * @name ObjectTrapper
   * @constructor
   * @param {object} target
   *
   * @property {function} ObjectTrapper.prototype.on
   *   Add a new handler. @see ObjectListener.prototype.on
   *
   * @property {function} ObjectTrapper.prototype.off
   *   Remove a handler. @see ObjectListener.prototype.off
   *
   * @property {function} ObjectTrapper.prototype.once
   *   Add a new handler function that will called once.
   *   @see ObjectListener.prototype.once
   *
   * @property {function} ObjectTrapper.prototype.clear
   *   Clear all of handlers. @see ObjectListener.prototype.clear
   */
  var ObjectTrapper = factories.ObjectTrapper =
    createConstructor('ObjectTrapper', extend(ObjectListener.prototype, {

    getTrappedTarget: function() {
      var trapper = this.events.trapper;
      if (!trapper || !trapper.trapped) {
        throw 'Failed to set trap handler';
      }
      return new Proxy(this.events.target, trapper.proxible);
    }
  }));


  /**
   * Create a trap proxy to watch object properties
   * That can notice the method calling and the changed value.
   *
   * MapTrapper's method usage is same as ObjectTrapper.
   *
   * @example
   *   var map = new Map();
   *   var trapper = new MapTrapper(map);
   *   trapper.on('get:a', function(target, key, value, args) {
   *     return value + 100;
   *   });
   *   var trappedMap = trapper.getTrappedTarget();
   *   trappedMap.set('a', 1);
   *   log(trappedMap.get('a')); // 101
   *   trapper.off('get:a');
   *   log(trappedMap.get('a')); // 1
   *
   * @example
   *   var map = new Map();
   *   map.set('a', 1);
   *   var trapper = new MapTrapper(map);
   *   trapper.on('change:a', function(target, key, value, args) {
   *     log(key + ':changed! => ' + value);
   *     return value;
   *   });
   *   var trappedMap = trapper.getTrappedTarget();
   *   trappedMap.set('a', 1);
   *   trappedMap.set('a', 2); // a:changed! => 2
   *   trappedMap.set('a', 2);
   *   trappedMap.set('a', 3); // a:changed! => 3
   *
   * @name MapTrapper
   * @constructor
   * @param {object} target
   *
   * @property {function} MapTrapper.prototype.on
   *   Add a new handler. @see ObjectListener.prototype.on
   *
   * @property {function} MapTrapper.prototype.off
   *   Remove a handler. @see ObjectListener.prototype.off
   *
   * @property {function} MapTrapper.prototype.once
   *   Add a new handler function that will called once.
   *   @see ObjectListener.prototype.once
   *
   * @property {function} MapTrapper.prototype.clear
   *   Clear all of handlers. @see ObjectListener.prototype.clear
   */
  //TODO: object key
  var MapTrapper = factories.MapTrapper =
    createConstructor('MapTrapper', extend(ObjectTrapper.prototype, {

    init: function() {
      (this.events.trapper || (this.events.trapper = {})).enableMap = true;
    }
  }));


  forEach(factories, function(Ctor, name) {
    define(name.toLowerCase(), function() { return Ctor; });
  });

  clearObject(factories), factories = null;

}());

