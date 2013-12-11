/*
 * SoundCloudPlayer : utils
 */

'use strict';


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


{
  exports.typeOf = function typeOf(x) {
    return x === null && 'null' ||
           x === void 0 && 'undefined' ||
           toString(x).slice(8, -1).toLowerCase();
  };


  [false, 0, '', function(){}, {}, /./, new Error(), new Date()].forEach(function(value) {
    let name = typeOf(value);
    let typeName = typeBrackets.join(name = name[0].toUpperCase() + name.slice(1));

    exports['is' + name] = function(x) {
      return toString(x) === typeName;
    };
  });


  exports.isArray = Array.isArray;

  exports.isArrayLike = function isArrayLike(x) {
    return isArray(x) || !(x == null || x.length - 0 !== x.length);
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
 * Iterate an iterator
 */
exports.iterate = function iterate(iter, func, context = null) {
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
};


/**
 * Iteration can stop by throw StopIteration;
 */
exports.forEach = function forEach(target, func, context = null) {
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
};


/**
 * Return a partially applied function
 */
exports.partial = function partial(func, ...rests) {
  return function(...args) {
    return func.apply(this, rests.concat(args));
  };
};


/**
 * Create function from any value.
 *
 * @param {function|*} fn
 * @return {function}
 */
exports.callback = function callback(fn) {
  return typeof fn === 'function' ?
         function() { return fn.apply(this, arguments); } :
         function() { return fn; };
};


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
exports.extend = function extend(...args) {
  extend.inherits || (extend.inherits = function(childFn, parentFn) {
    return function() {
      return childFn.apply(this, arguments), parentFn.apply(this, arguments);
    };
  });

  var child;

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
        val = extend.inherits(child[key], val);
      }

      child[key] = val;
    }

    Ctor = null;
  });
  return child;
};


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
 * @param {string} [name] name of constructor
 * @param {function|object} [Ctor] constructor function or protorype
 * @param {object} [proto]  prototype object
 * @return {Function} Return a new constructor function
 */
exports.createConstructor = function createConstructor(name, Ctor, proto) {
  var order = { s: 0, f: 1, o: 2 };

  [name, Ctor, proto] = Array.slice(arguments).reduce(function(args, a) {
    return args[order[(typeof a)[0]]] = a, args;
  }, []);

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
  }(Ctor || function(){}));

  Ctor.prototype = proto = normalizeProps(proto || {}), proto.constructor = Ctor;
  name && setObjectName(Ctor, name);
  return Ctor;
};


/**
 * Return a new object.
 *
 * @param {string} [name] object name
 * @param {object} [obj] object
 * @return {Object} object
 */
exports.createObject = function createObject(name, obj) {
  return new (createConstructor.apply(null, arguments));
};


/**
 * Normalize object properties.
 *
 * @example
 *   var o = normalizeProps({
 *     const: {
 *       FOO: 1,
 *       BAR: 2
 *     },
 *     private: {
 *       _value: null
 *     },
 *     init: function() {
 *       this._value = this.FOO + this.BAR;
 *     },
 *     get value() {
 *       return this._value;
 *     }
 *   });
 *   o.init();
 *   log(o.value); // 3
 *   o.FOO = 100; // TypeError: "FOO" is read-only
 *   log(Object.keys(o)); // ['FOO', 'BAR', 'init', 'value']
 *
 * @param {object|function} target
 * @return {object|function}
 */
exports.normalizeProps = function normalizeProps(target) {
  var def = normalizeProps.definition || (normalizeProps.definition = {
    const: {
      writable: false,
      configurable: false
    },
    private: {
      enumerable: false
    }
  });

  Object.keys(target).forEach(function(key) {
    if (hasOwn(def, key)) {
      var props = target[key];

      Object.keys(props).forEach(function(p) {
        defineProp(target, p, mixin({}, def[key], {
          value: props[p]
        }));
      });
      delete target[key];
    }
  });
  return target;
};


/**
 * A handy shortcut of Object.defineProperty
 */
exports.defineProp = function defineProp(target, key, desc) {
  var defaults = defineProp.defaults || (defineProp.defaults = {
    writable: true,
    enumerable: true,
    configurable: true
  });

  var opts = mixin({}, defaults, desc);
  if (desc.get || desc.set) {
    delete opts.writable;
  }
  return Object.defineProperty(target, key, opts), target;
};


/**
 * Set toString function to object.
 */
exports.setObjectName = function setObjectName(target, name, protoOnly = false) {
  var typeName = typeBrackets.join(name);
  var toString = function toString() { return typeName; };
  var proto = target.prototype || (target.prototype = {});

  if (protoOnly) {
    return proto.toString = toString, target;
  }
  return target[name] = proto[name] = target,
         target.toString = proto.toString = toString, target;
};


/**
 * Return a new function that will called once.
 */
exports.once = function once(func, callback = null) {
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
};


/**
 * Timer utility
 */
define('timer', function factory_Timer() {
  return createConstructor('Timer', {
    private: {
      _ids: null
    },
    init: function() {
      this._ids = {};
    },
    set: function(func, msec = 0) {
      var id = setTimeout(function() {
        try {
          func();
        } finally {
          this.clear(id);
        }
      }.bind(this), msec);

      return this._ids[id] = id, this;
    },
    clear: function(id) {
      if (id in this._ids) {
        clearTimeout(id), delete this._ids[id];
      }
      return this;
    },
    clearAll: function() {
      var keys = Object.keys(this._ids);
      for (var i = 0, len = keys.length; i < len; i++) {
        this.clear(keys[i]);
      }
      return this.init(), this;
    }
  });
});


/**
 * Generate an unique id from object.
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


