/*
 * SoundCloudPlayer : utils
 */

'use strict';

const PREF_PREFIX = 'extensions.soundcloudplayer.';

// ----- XPCOM constants/utilities -----

const INTERFACES = [Ci[i] for (i in Ci)];

const ConsoleService    = getService('consoleservice', Ci.nsIConsoleService);
const WindowMediator    = getService('appshell/window-mediator', Ci.nsIWindowMediator);
const JSSubScriptLoader = getService('moz/jssubscript-loader', Ci.mozIJSSubScriptLoader);
const StringBundle      = getService('intl/stringbundle', Ci.nsIStringBundleService)
                        .createBundle(getChromeURI('/locale/soundcloudplayer.properties'));
const PrefService       = getService('preferences-service', null);

exports.getPref = partial(getPrefValue, PREF_PREFIX);
exports.setPref = partial(setPrefValue, PREF_PREFIX);

var getPrefBranch = function() {
  return PrefService.getBranch('');
};

// ----- Objective utilities -----

// Avoid notice for mozilla firefox addon validator.
// `Function` can't use for strict check.
//XXX: constructor
let (p = Object.constructor.prototype) {
  exports.toSource    = p.toString.call.bind(p.toString);
  exports.isGenerator = p.isGenerator.call.bind(p.isGenerator);
}

let (p = Object.prototype) {
  exports.hasOwn   = p.hasOwnProperty.call.bind(p.hasOwnProperty);
  exports.toString = p.toString.call.bind(p.toString);
  var typeBrackets = toString(Object()).split('Object');
}


let (typeis = {}) {

  let getType = function(type) {
    let name = type.toLowerCase();
    return typeBrackets.join(name.charAt(0).toUpperCase() + name.slice(1));
  };

  ['Boolean', 'Number', 'String', 'Function', 'Object'].forEach(function(type) {
    let typeName = getType(type);

    typeis[type] = function(x) {
      return toString(x) === typeName;
    };
  });

  exports.typeOf = function typeOf(x) {
    return x === null && 'null' ||
           x === void 0 && 'undefined' ||
           toString(x).slice(8, -1).toLowerCase();
  };

  forEach({
    isArray    : Array.isArray,
    isObject   : typeis.Object,
    isNumber   : typeis.Number,
    isString   : typeis.String,
    isFunction : typeis.Function,
    isDate     : function(x) { return x instanceof Date; },
    isError    : function(x) { return x instanceof Error; }
    isRegExp   : function(x) { return x instanceof RegExp; },
    isBoolean  : function(x) { return x === false || x === true || typeis.Boolean(x); },
  }, function(fn, name) {
    exports[name] = fn;
  });

  exports.isArrayLike = function isArrayLike(x) {
    return isArray(x) || (x != null && x.length - 0 === x.length);
  };

  exports.isPrimitive = function isPrimitive(x) {
    let type;
    return x == null || !((type = typeof x) === 'object' || type === 'function');
  };

  let isIterableCode = /\[native\s*code\]|StopIteration/i;

  exports.isIterable = function isIterable(x) {
    return x != null && typeof x.next === 'function' &&
           isIterableCode.test(toSource(x.next));
  };
}


/**
 * A shortcut of Object.keys
 */
exports.keys = Object.keys;


/**
 * Return array/object values
 *
 * @param {object|array|function} o
 * @return {array}
 */
exports.values = function values(o) {
  // faster way for Object.keys(o).map((k) => o[k]);
  var result = [];
  var keys = Object.keys(o);
  for (var i = 0, len = keys.length; i < len; i++) {
    result.push(keys[i]);
  }
  return result;
};


/**
 * Iterate a iterator.
 */
function iterate(iter, func, context) {
  try {
    do {
      func.apply(context, Array.concat(iter.next()));
    } while (true);
  } catch (e) {
    if (e !== StopIteration) {
      throw e;
    }
  }
  return iter;
}


/**
 * Iteration can stop by throw StopIteration;
 */
function forEach(target, func, context) {
  if (target == null) {
    return;
  }

  try {
    if (target.forEach) {
      target.forEach(func, context);
    } else if (isGenerator(target)) {
      iterate(target(), func, context);
    } else if (isIterable(target)) {
      iterate(target, func, context);
    } else {
      var keys = Object.keys(target);
      for (var i = 0, len = keys.length; i < len; i++) {
        func.call(context, target[keys[i]], keys[i], target);
      }
    }
  } catch (e) {
    if (e !== StopIteration) {
      throw e;
    }
  }
  return target;
}

exports.forEach = forEach;


/**
 * Return a partially applied function
 */
function partial(func, ...rests) {
  return function(...args) {
    return func.apply(this, rests.concat(args));
  };
}

exports.partial = partial;


/**
 * Create function from any value.
 *
 * @param {function|*} fn
 * @return {function}
 */
function callback(fn) {
  return typeof fn === 'function' ?
         function() { return fn.apply(this, arguments); } :
         function() { return fn; };
}

exports.callback = callback;


/**
 * Return inherited object/function from arguments object.
 * If method name conflicts, it will inherited from the parent method.
 *
 * @example
 *   var a = { init: function() { log(1) } };
 *   var b = { init: function() { log(2) } };
 *   var c = { init: function() { log(3) } };
 *   var d = extend(a, b, c);
 *   d.init();
 *   // 1
 *   // 2
 *   // 3
 *
 * @param {array.<object|function>} args
 * @return {object|function}
 */
function extend(...args) {
  var child;

  var inherits = function inherits(childFn, parentFn) {
    return function() {
      return childFn.apply(this, arguments), parentFn.apply(this, arguments);
    };
  };

  args.forEach(function(parent) {
    child || (child = typeof parent === 'function' ? function(){} : {});

    var keys = Object.keys(parent);
    var Ctor = parent.constructor;

    for (var i = 0, len = keys.length; i < len; i++) {
      var key = keys[i];
      var val = parent[key];

      // ignore constructor property
      if (Ctor && val === Ctor) {
        continue;
      }

      if (typeof val === 'function' && hasOwn(child, key) &&
          typeof child[key] === 'function') {
        val = inherits(child[key], val);
      }

      child[key] = val;
    }

    Ctor = null;
  });
  return child;
}

exports.extend = extend;


/**
 * Return a constructor function
 * that can create new instance by method of
 *  both new operator and non-new operator calls.
 *
 * @example
 *   var A = createConstructor({
 *     init: function(a, b) {
 *       this.value = a + b;
 *     }
 *   });
 *   var a = new A(1, 2); // or var a = A(1, 2);
 *   log(a.value); // 3
 *
 * @example
 *   var A = createConstructor(function(a, b) {
 *     this.value = a + b;
 *   });
 *   var a = new A(10, 20);
 *   log(a.value); // 30
 *
 * @example
 *   var A = createConstructor(function() {
 *     this.value = 'new!';
 *   }, {
 *     init: function() {
 *       this.value += 'init';
 *     }
 *   });
 *   var a = new A();
 *   log(a.value); // new!init
 *
 * @param {function|object} [Ctor] constructor function or protorype
 * @param {object} [proto]  prototype object
 * @param {string} [name] Constructor name
 * @return {Function} Constructor function
 */
function createConstructor(Ctor, proto, name) {
  if (typeof Ctor === 'string') {
    [Ctor, proto, name] = [proto, name, Ctor];
  }
  if (typeof proto === 'string') {
    [proto, name] = [name, proto];
  }

  if (!Ctor || typeof Ctor === 'object') {
    proto = Ctor || {}, Ctor = function(){};
  } else {
    proto || (proto = {});
  }

  Ctor = (function(Ctor_) {
    return function() {
      var args = arguments;

      if (this instanceof Ctor) {
        Ctor_.apply(this, args);
        this.init && this.init.apply(this, args);
        return this;
      }

      return new (Ctor.bind.apply(Ctor, args));
    };
  }(Ctor));

  Ctor.prototype = proto, proto.constructor = Ctor;
  name && setObjectName(Ctor, name);
  return Ctor;
}

exports.createConstructor = createConstructor;


/**
 * Return a new object.
 *
 * @param {object} [obj] object
 * @param {string} [name] object name
 * @return {Object} object
 */
function createObject(obj, name) {
  return new (createConstructor.apply(null, arguments));
}

exports.createObject = createObject;


/**
 * Set toString function to object.
 */
function setObjectName(target, name, protoOnly = false) {
  var typeName = typeBrackets.join(name);
  var toString = function toString() { return typeName; };
  var proto = target.prototype || (target.prototype = {});

  if (protoOnly) {
    return proto.toString = toString, target;
  }
  return target[name] = proto[name] = target,
         target.toString = proto.toString = toString, target;
}

exports.setObjectName = setObjectName;


/**
 * Return a new function that will called once.
 */
function once(func, callback = null) {
  var result;
  var called = false;

  return function() {
    if (called) {
      return result;
    }
    try {
      return result = func.apply(this, arguments);
    } finally {
      called = true, func = null;
      callback && callback.apply(this, arguments);
    }
  };
}

exports.once = once;


/**
 * A handy shortcut of Object.defineProperty
 */
function defineProp(target, key, desc) {
  var defaults = {
    writable: true,
    enumerable: true,
    configurable: true
  };

  var opts = mixin({}, defaults, desc);
  if (desc.get || desc.set) {
    delete opts.writable;
  }
  return Object.defineProperty(target, key, opts), target;
}

exports.defineProp = defineProp;


/**
 * Timer utility
 */
define('timer', function factory_Timer() {
  return createConstructor('Timer', {
    ids: null,
    init: function() {
      this.ids = {};
    },
    set: function(func, msec) {
      var id = setTimeout(function() {
        try {
          func();
        } finally {
          this.clear(id);
        }
      }.bind(this), msec || 0);

      return this.ids[id] = id, this;
    },
    clear: function(id) {
      if (id in this.ids) {
        clearTimeout(id), delete this.ids[id];
      }
      return this;
    },
    clearAll: function() {
      var keys = Object.keys(this.ids);
      for (var i = 0, len = keys.length; i < len; i++) {
        this.clear(keys[i]);
      }
      return this.init(), this;
    }
  });
});


/**
 * Generate a unique id from object.
 *
 * @example
 *   var o = {};
 *   log(ObjectId.get(o));            // .taghjzikde
 *   log(ObjectId.get(o));            // .taghjzikde
 *   log(ObjectId.get({}));           // .nbajy0x68cf
 *   log(ObjectId.get(function(){})); // .76ir0q75kaj
 *   log(ObjectId.get(function(){})); // .4qcx2vm577d
 *   var func = function(){};
 *   log(ObjectId.get(func));         // .k7zlhrwqaad
 *   log(ObjectId.get(func));         // .k7zlhrwqaad
 *   var arr = [1, 2, 3];
 *   log(ObjectId.get(arr));          // .1apckbwi1yj
 *   log(ObjectId.get(arr));          // .1apckbwi1yj
 *   log(ObjectId.get([]));           // .ml7jpun4s0r
 *
 * @property {function} ObjectId.get
 *   Get an unique id from object.
 *
 *   @param {object|function|array|*} o
 *   @return {string}
 *
 * @property {function} ObjectId.clear
 *   Clear all of ids.
 *
 *   @return {undefined}
 */
define('objectid', function factory_ObjectId() {
  var map = new Map();
  var wap = new WeakMap();
  var ids = {};
  var genId = function() {
    // Dot will be avoid conflicts of keywords
    // that occur in very low probability.
    var id = Math.random().toString(36).slice(1);
    return id in ids ? genId() : (ids[id] = null, id);
  };

  return createObject('ObjectId', {
    get: function(o) {
      var id, store = isPrimitive(o) ? map : wap;

      if (store.has(o)) {
        return store.get(o);
      }

      return store.set(o, id = genId()), id;
    },
    clear: function() {
      map.clear(), wap.clear(), clearObject(ids);
    }
  });
});


/**
 * Create object metadata.
 *
 * @example
 *   var obj = {a: 1, b: 2, c: 3};
 *   var meta = ObjectMeta.get(obj);
 *   meta.a = typeof obj.a;
 *   log(meta.a); // number
 *   log(obj.a);  // 1
 *   meta.len = Object.keys(obj).length;
 *   log(meta.len); // 3
 *   log(obj.len);  // undefined
 *   var meta2 = ObjectMeta.get(obj);
 *   log(meta2); // { a: "number", len: 3 }
 *   log(meta === meta2); // true
 *
 * @example
 *   // private usage:
 *   var obj = {a: 1, b: 2};
 *   var meta = new ObjectMeta(obj);
 *   meta.size = Object.keys(obj).length;
 *   log(meta.size); // 2
 *   var meta2 = new ObjectMeta(obj);
 *   log(meta2.size); // undefined
 *   log(meta === meta2); // false
 *
 * @name ObjectMeta
 * @constructor
 * @param {object|function|array|*} target
 * @return {object} return a plain object
 */
define('objectmeta', function factory_ObjectMeta() {
  var globalwm;

  var createMeta = function(o) {
    return setObjectName(o || {}, 'ObjectMeta');
  };

  var init = function(target) {
    if (this instanceof ObjectMeta) {
      this._wm = new WeakMap();
      return this._wm.set(target, this.meta = createMeta()), this.meta;
    }
    return ObjectMeta.get(target);
  };

  var ObjectMeta = mixin(createMeta(function ObjectMeta(target) {
    return init.call(this, target);
  }), {
    get: function(target) {
      globalwm || (globalwm = new WeakMap());

      if (globalwm.has(target)) {
        return globalwm.get(target);
      }

      var meta = createMeta();
      return globalwm.set(target, meta), meta;
    },
    clear: function() {
      globalwm && globalwm.clear();
    }
  });
  return ObjectMeta.prototype = createMeta(), ObjectMeta;
});


// ----- Browser/DOM/XPCOM utilities -----

function __(label, params) {
  var result;
  try {
    if (params === void 0) {
      result = StringBundle.GetStringFromName(label);
    } else {
      result = StringBundle.formatStringFromName(label, params, params.length);
    }
  } catch (e) {
    result = '';
  }
  return result;
}

exports.__ = __;


function getService(cid, ifc) {
  var c = Cc['@mozilla.org/' + cid + ';1'];
  if (!c) {
    return;
  }
  try {
    return ifc ? c.getService(ifc) : broad(c.getService());
  } catch (e) {}
}

exports.getService = getService;


/*
 * Functions from tombfix (tombloo fork) utilities.
 * https://github.com/tombfix/core
 * These functions follows tombfix/tombloo license.
 */

function broad(obj, ifcs) {
  ifcs = ifcs || INTERFACES;

  for (var i = 0, len = ifcs.length; i < len; i++) {
    try {
      if (obj instanceof ifcs[i]);
    } catch (e) {}
  }
  return obj;
}

exports.broad = broad;


function wrappedObject(obj) {
  return obj.wrappedJSObject || obj;
}

exports.wrappedObject = wrappedObject;


function getMostRecentWindow() {
  return WindowMediator.getMostRecentWindow('navigator:browser');
}

exports.getMostRecentWindow = getMostRecentWindow;


function getPrefType(key) {
  var branch = getPrefBranch();

  switch (branch.getPrefType(key)) {
    case branch.PREF_STRING: return 'string';
    case branch.PREF_BOOL: return 'boolean';
    case branch.PREF_INT: return 'number';
    case branch.PREF_INVALID: default: return 'undefined';
  }
}


function setPrefValue() {
  var value = Array.pop(arguments);
  var key = Array.join(arguments, '');
  var prefType = getPrefType(key);
  var branch = getPrefBranch();
  var type = (prefType !== 'undefined') ? prefType : typeof value;

  switch (type) {
    case 'string': return branch.setCharPref(key, unescape(encodeURIComponent(value)));
    case 'boolean': return branch.setBoolPref(key, value);
    case 'number': return branch.setIntPref(key, value);
  }
}


function getPrefValue() {
  var key = Array.join(arguments, '');
  var branch = getPrefBranch();

  switch (branch.getPrefType(key)) {
    case branch.PREF_STRING: return decodeURIComponent(escape(branch.getCharPref(key)));
    case branch.PREF_BOOL: return branch.getBoolPref(key);
    case branch.PREF_INT: return branch.getIntPref(key);
  }
}


function addTab(url, background) {
  var d = new Deferred();
  var tabbrowser = getMostRecentWindow().getBrowser();
  var tab = tabbrowser.addTab(url);
  var browser = tab.linkedBrowser;

  if (!background) {
    tabbrowser.selectedTab = tab;
  }
  browser.addEventListener('DOMContentLoaded', function onLoad(event) {
    browser.removeEventListener('DOMContentLoaded', onLoad, true);
    d.begin(wrappedObject(event.originalTarget.defaultView));
  }, true);

  return d;
}

exports.addTab = addTab;


function isEmpty(obj) {
  for (var i in obj) {
    return false;
  }
  return true;
}

exports.isEmpty = isEmpty;


function clearObject(obj) {
  for (var p in obj) {
    delete obj[p];
  }
  return obj;
}

exports.clearObject = clearObject;


function log(msg) {
  try {
    if (!firebug('log', arguments)) {
      throw false;
    }
  } catch (e) {
    ConsoleService.logStringMessage('' + msg);
  }
  return msg;
}

exports.log = log;


function error(err) {
  try {
    if (!firebug('error', arguments)) {
      throw false;
    }
  } catch (e) {
    Cu.reportError(err);
  }
  return err;
}

exports.error = error;


function firebug(method, args) {
  var win = getMostRecentWindow();

  if (win.FirebugConsole && win.FirebugContext) {
    try {
      var console = new win.FirebugConsole(win.FirebugContext, win.content);
      console[method].apply(console, args);
      return true;
    } catch (e) {}
  }

  // Firebug 1.2~
  if (win.Firebug && win.Firebug.Console) {
    try {
      win.Firebug.Console.logFormatted.call(
        win.Firebug.Console, Array.slice(args),
        win.FirebugContext,
        method
      );
      return true;
    } catch(e) {}
  }
  return false;
}

