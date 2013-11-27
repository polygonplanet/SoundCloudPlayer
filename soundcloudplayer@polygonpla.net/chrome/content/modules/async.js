/*
 * SoundCloudPlayer : async
 */

/*
 * Portions of this code are from MochiKit.Async, received by
 *  the SoundCloudPlayer authors under the MIT license.
 */
'use strict';

// Deferred constructor based from MochiKit.Async.Deferred
// http://mochi.github.io/mochikit/
// These code follows MochiKit license.
var Deferred = (function() {

  var SUCCESS = 0,
      FAILURE = 1,
      FIRED   = 2,
      UNFIRED = 3;

  var Deferred = function(canceller) {
    return this.init.apply(this, arguments);
  };

  Deferred.prototype = {
    Deferred: Deferred,

    state: UNFIRED,
    paused: 0,
    chained: false,
    cancelled: false,
    unhandledErrorTimerId: null,

    init: function(canceller) {
      this.chain = [];
      this.results = [null, null];
      this.canceller = canceller;
      return this;
    },

    cancel: function() {
      if (!this.cancelled) {
        this.cancelled = true;
        if (this.state === UNFIRED) {
          this.canceller && this.canceller.apply(this, arguments);
        } else if (this.state === FIRED && isDeferred(this.results[SUCCESS])) {
          this.results[SUCCESS].cancel.apply(this, arguments);
        }
      }
      return this;
    },

    then: function(callback, errback) {
      if (!this.chained && !this.cancelled) {
        this.chain.push([callback, errback]);

        if (isFireable(this.state)) {
          fire.call(this);
        }
      }
      return this;
    },
    rescue: function(errback) {
      return this.then(null, errback);
    },
    ensure: function(callback) {
      return this.then(callback, callback);
    },

    begin: function() {
      return prepare.apply(this, arguments);
    },
    raise: function(res) {
      var args = Array.slice(arguments, 1);
      args.unshift(error(res));
      return prepare.apply(this, args);
    },
    end: function() {
      this.chained = true;
      return this;
    }
  };

  (function(p) {
    mixin(p, {
      addCallbacks : p.then,
      addCallback  : p.then,
      addErrback   : p.rescue,
      addBoth      : p.ensure,
      callback     : p.begin,
      errback      : p.raise
    });
  }(Deferred.prototype));

  Deferred.isDeferred = isDeferred;
  Deferred.isChainable = isChainable;


  var isDeferred = function(d) {
    return d != null && d.Deferred === Deferred;
  };


  var isChainable = function(x) {
    return isDeferred(x) && !x.chained && !x.cancelled;
  };


  var isFireable = function(state) {
    return !!(state ^ UNFIRED);
  };


  var error = function(e) {
    return isError(e) ? e : new Error(e);
  };


  var setState = function(res) {
    this.state = isError(res) ? FAILURE : SUCCESS;
  };


  var hasErrback = function() {
    var chain = this.chain;
    for (var i = 0, len = chain.length; i < len; i++) {
      if (chain[i] && isFunction(chain[i][1])) {
        return true;
      }
    }
    return false;
  };


  var prepare = function(res) {
    setState.call(this, res);
    this.results[this.state] = res;
    return fire.call(this);
  };


  var fire = function() {
    var that = this;
    var chain = this.chain;
    var res = this.results[this.state];
    var cb, fn, unhandledError;

    if (this.unhandledErrorTimerId && isFireable.call(this) && hasErrback.call(this)) {
      clearTimeout(this.unhandledErrorTimerId);
      delete this.unhandledErrorTimerId;
    }

    while (chain.length && !this.paused && !this.cancelled) {
      fn = chain.shift()[this.state];

      if (!fn) {
        continue;
      }

      try {
        res = fn.call(this, res);
        setState.call(this, res);

        if (isDeferred(res)) {
          cb = function() {
            prepare.apply(that, arguments);

            that.paused--;
            if (!that.paused && isFireable(that.state)) {
              fire.call(that);
            }
          };
          this.paused++;
        }
      } catch (e) {
        this.state = FAILURE;
        res = error(e);

        if (!hasErrback.call(this)) {
          unhandledError = true;
        }
      }
    }
    this.results[this.state] = res;

    if (cb && this.paused) {
      res.ensure(cb);
      res.chained = true;
    }

    if (unhandledError) {
      // Resolve the error implicit in the asynchronous processing.
      this.unhandledErrorTimerId = setTimeout(function() {
        try {
          throw res;
        } finally {
          delete that.unhandledErrorTimerId;
        }
      }, 0);
    }
    return this;
  };

  return Deferred;

}());

var isDeferred = Deferred.isDeferred;
var isChainable = Deferred.isChainable;


// Call the function in the background (i.e. in non-blocking)
// Code from lazyIter.js
//XXX: Use MutationObserver for fast calling.
var lazy = (function() {
  var byTick = (function() {
    if (typeof process === 'object' && typeof process.nextTick === 'function') {
      return process.nextTick;
    }
  }()),
  byImmediate = (function() {
    if (typeof setImmediate === 'function') {
      return function(callback) {
        try {
          return setImmediate(callback);
        } catch (e) {
          return (byImmediate = byTimer)(callback);
        }
      };
    }
  }()),
  byMessage = (function() {
    var channel, queue;

    if (typeof MessageChannel !== 'function') {
      return false;
    }

    try {
      channel = new MessageChannel();
      if (!channel.port1 || !channel.port2) {
        return false;
      }
      queue = [];
      channel.port1.onmessage = function() {
        queue.shift()();
      };
    } catch (e) {
      return false;
    }

    return function(callback) {
      queue.push(callback);
      channel.port2.postMessage('');
    };
  }()),
  byEvent = (function() {
    var data;

    if (typeof window !== 'object' || typeof document !== 'object' ||
        typeof Image !== 'function' ||
        typeof document.addEventListener !== 'function'
    ) {
      return false;
    }

    try {
      if (typeof new Image().addEventListener !== 'function') {
        return false;
      }
    } catch (e) {
      return false;
    }

    // Dummy 1x1 gif image.
    data = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

    return function(callback) {
      var done;
      var img = new Image();
      var handler = function() {
        img.removeEventListener('load', handler, false);
        img.removeEventListener('error', handler, false);
        if (!done) {
          done = true;
          callback();
        }
      };

      img.addEventListener('load', handler, false);
      img.addEventListener('error', handler, false);

      try {
        img.src = data;
      } catch (e) {
        (byEvent = byTimer)(callback);
      }
    };
  }()),
  byTimer = function(callback, msec) {
    var timer = new Timer();
    var id = timer.set(function() {
      try {
        callback();
      } finally {
        timer.clearAll();
        timer = null;
      }
    }, msec || 0);
    return id;
  };

  return function(callback) {
    return (byTick || byImmediate || byMessage || byEvent || byTimer)(callback);
  };
}());


/**
 * A shortcut faster way of creating new Deferred sequence.
 *
 * @example
 *   async(function() {
 *     console.log('Start Deferred chain');
 *   }).then(function() {
 *     console.log('End Deferred chain');
 *   });
 *
 * @param {function|*} fn  A callback function or any value.
 * @return {Deferred} Return a Deferred object.
 */
function async(fn) {
  var d = new Deferred();
  var args, v;

  if (isFunction(fn)) {
    args = Array.slice(arguments, 1);
    d.then(function() {
      return fn.apply(this, args);
    });
  } else {
    v = fn;
  }
  return lazy(function() {
    d.begin(v);
  }), d;
}

mixin(async, {
  Deferred: Deferred,
  lazy: lazy,

  succeed: function() {
    var d = new Deferred();
    return d.begin.apply(d, arguments);
  },

  failure: function() {
    var d = new Deferred();
    return d.raise.apply(d, arguments);
  },

  maybeDeferred: function(x) {
    var result, v;

    try {
      if (isError(x)) {
        throw x;
      }

      if (isFunction(x)) {
        v = x.apply(x, Array.slice(arguments, 1));
      } else {
        v = x;
      }

      if (isDeferred(v)) {
        result = v;
      } else {
        result = async.succeed(v);
      }
    } catch (e) {
      result = async.failure(e);
    }
    return result;
  },

  maybeDeferreds: function(/* ... */) {
    return Array.slice(arguments).map(async.maybeDeferred);
  },

  wait: function(seconds, value) {
    var timerId;
    var args = Array.slice(arguments, 1);
    var d = new Deferred(function() {
      clearTimeout(timerId);
    });

    timerId = setTimeout(function() {
      d.begin();
    }, Math.floor(((seconds - 0) || 0) * 1000));

    if (args.length) {
      d.then(function() {
        return value;
      });
    }
    return d;
  },

  callLater: function(seconds, func) {
    var args = Array.slice(arguments, 2);
    return async.wait(seconds).then(function() {
      if (isDeferred(func)) {
        return func.begin.apply(func, args);
      }
      if (isFunction(func)) {
        return func.apply(func, args);
      }
      return func;
    });
  },

  observe: function(func, delay) {
    var d = new Deferred();
    var timer = new Timer();

    if (delay - 0 !== delay) {
      delay = 13;
    }

    return async(function observing() {
      var time = Date.now();

      try {
        var res = func();
        if (res === false) {
          throw StopIteration;
        }
        var interval = Math.min(1500, delay + (Date.now() - time));
        timer.set(observing, interval);

      } catch (e) {
        timer.clearAll();

        if (e === StopIteration) {
          d.begin();
        } else {
          d.raise(e);
        }
      }
    }), d;
  },

  till: function(cond, max) {
    var d = new Deferred();
    if (!cond) {
      return d.raise();
    }
    var endTime = (max - 0 === max) ? max * 1000 : 0;
    var args = Array.slice(arguments, 2);
    var interval = 13;
    var lock, end, lockedCount = 0;
    var timer = new Timer();
    var startTime = Date.now();

    return async(function tilling() {
      try {
        if (end) {
          timer.clearAll();
          return;
        }

        if (lock) {
          if (++lockedCount > 1) {
            lockedCount--;
            return;
          }
          timer.set(function() {
            if (--lockedCount === 0) {
              tilling();
            }
          }, interval);
          return;
        }
        lock = true;

        var time = Date.now();

        async(function() {
          return cond.apply(this, args);
        }).then(function(res) {
          if (res) {
            end = true;
            timer.clearAll();
            d.begin();
          } else {
            var ms = Math.max(1, Math.min(1000, interval + (Date.now() - time)));
            timer.set(function() {
              lock = false;
              tilling();
            }, ms);
          }
        }).rescue(function(err) {
          end = true;
          timer.clearAll();
          d.raise(err);
        });
      } catch (e) {
        end = true;
        timer.clearAll();
        d.raise(e);
      } finally {
        if (endTime && Date.now() - startTime > endTime) {
          end = true;
          timer.clearAll();
          d.begin(false);
        }
      }
    }), d;
  }
});

