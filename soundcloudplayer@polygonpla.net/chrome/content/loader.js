/*
 * SoundCloudPlayer : loader
 */
(function() {
'use strict';

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

const JSSubScriptLoader = Cc['@mozilla.org/moz/jssubscript-loader;1']
                        .getService(Ci.mozIJSSubScriptLoader);

const MODULE_FILES = [
  'utils.js',
  'trappers.js',
  'player.js'
  //TODO: 途中
];

const CHROME_DIR  = 'chrome://soundcloudplayer';
const CONTENT_DIR = CHROME_DIR + '/content';
const MODULE_DIR  = CONTENT_DIR + '/modules';


var mixin = function mixin(target, ...args) {
  args.forEach(function(source) {
    var keys = Object.keys(source);
    for (var i = 0, len = keys.length; i < len; i++) {
      var key = keys[i];
      target[key] = source[key];
    }
  });
  return target;
};


var once = function once(target, type, handler) {
  target.addEventListener(type, function callee() {
    target.removeEventListener(type, callee, false);
    handler.apply(this, arguments);
  }, false);
};

// ----- Modules -----

var loadModules = function loadModules() {
  MODULE_FILES.forEach(function(fileName) {
    new Module(MODULE_DIR + '/' + fileName).load();
  });
};


var Module = mixin(function Module(src) {
  return this instanceof Module ? this.init(src) : new Module(src);
}, {
  cache: new WeakMap(),
  modules: new Map(),
  symbols: {},

  define: function define(name, factory) {
    Module.modules.set(name.toLowerCase(), factory);
  },
  require: function require(name) {
    name = name.toLowerCase();

    if (!Module.modules.has(name)) {
      return;
    }

    var factory = Module.modules.get(name);
    if (Module.cache.has(factory)) {
      return Module.cache.get(factory);
    }

    var module = factory();
    return Module.cache.set(factory, module), module;
  },
  clear: function() {
    Module.cache.clear(), Module.modules.clear();
    delete Module.symbols, Module.symbols = {};
  }
});

Module.prototype = {
  init: function(src) {
    this.src = src;
    this.scope = {};
    this._exports = {};

    this.exports = new Proxy(this._exports, {
      set: function(target, name, value) {
        return target[name] = this.scope[name] = value, true;
      }.bind(this)
    });

    mixin(this.scope, Module.defaultSymbols, Module.symbols, {
      exports: this.exports
    });
    return this;
  },
  load: function() {
    JSSubScriptLoader.loadSubScript(this.src), this.scope, 'UTF-8');
    return this.exportSymbols();
  },
  exportSymbols: function() {
    var keys = Object.keys(this._exports);
    for (var i = 0, len = keys.length; i < len; i++) {
      Module.symbols[keys[i]] = this._exports[keys[i]];
    }
    return this;
  }
};

Module.defaultSymbols = {
  Cc: Cc,
  Ci: Ci,
  Cr: Cr,
  Cu: Cu,
  CHROME_DIR: CHROME_DIR,
  CONTENT_DIR: CONTENT_DIR,
  MODULE_DIR: MODULE_DIR,
  define: Module.define,
  require: Module.require,
  mixin: mixin
};


// ----- initialize -----

once(window, 'load', function() {
  try {
    loadModules();
    Module.require('soundcloudplayer').setup();
  } catch (e) {
    (Module.symbols.error || Cu.reportError)(e);
  }
});

once(window, 'close', function() {
  Module && Module.clear();
});


}());
