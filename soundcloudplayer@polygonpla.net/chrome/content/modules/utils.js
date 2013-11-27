/*
 * SoundCloudPlayer : utils
 */

'use strict';

var global = this;

const { classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components;

const PREF_PREFIX = 'extensions.soundcloudplayer.';

const CHROME_DIR  = 'chrome://soundcloudplayer';
const CONTENT_DIR = CHROME_DIR  + '/content';
const MODULE_DIR  = CONTENT_DIR + '/modules';

const INTERFACES = values(Ci);

const StopIteration = defineSymbolicObject('StopIteration');

const ConsoleService = getService('consoleservice', Ci.nsIConsoleService);
const WindowMediator = getService('appshell/window-mediator', Ci.nsIWindowMediator);
const JSSubScriptLoader = getService('moz/jssubscript-loader', Ci.mozIJSSubScriptLoader);
const StringBundle = getService('intl/stringbundle', Ci.nsIStringBundleService)
                   .createBundle(getChromeURI('/locale/soundcloudplayer.properties'));
const PrefService = getService('preferences-service', null);

var getPref = partial(getPrefValue, PREF_PREFIX);
var setPref = partial(setPrefValue, PREF_PREFIX);

var getPrefBranch = function() {
  return PrefService.getBranch('');
};


var objectProto = Object.prototype;
var toObjectString = objectProto.toString;
var objectStringified = toObjectString.call(objectProto).split('Object');


var typeOf = (function() {
  var types = {};
  var getType = function(type) {
    var name = type.toLowerCase();
    return objectStringified[0] +
           name.charAt(0).toUpperCase() + name.slice(1) +
           objectStringified[1];
  };

  'Boolean Number String Function Array Date RegExp Object Error'.split(' ').forEach(function(type) {
    var lower = type.toLowerCase();

    types['is' + type] = (function() {
      var typeName = getType(type);

      switch (lower) {
        case 'error':
            return function(o) {
              return (o != null && (o instanceof Error || toObjectString.call(o) === typeName));
            };
        case 'date':
            return function(o) {
              return (o != null && (o instanceof Date || toObjectString.call(o) === typeName));
            };
        default:
            return function(o) {
              return toObjectString.call(o) === typeName;
            };
      }
    }());
  });
  return mixin(function(o) {
    if (o === null) {
      return 'null';
    }
    if (o === void 0) {
      return 'undefined';
    }
    return toObjectString.call(o).slice(8, -1).toLowerCase();
  }, types);
}());


var isBoolean   = typeOf.isBoolean;
var isNumber    = typeOf.isNumber;
var isString    = typeOf.isString;
var isFunction  = typeOf.isFunction;
var isArray     = typeOf.isArray;
var isDate      = typeOf.isDate;
var isRegExp    = typeOf.isRegExp;
var isObject    = typeOf.isObject;
var isError     = typeOf.isError;
var isArrayLike = function(x) {
  return typeOf.isArray(x) || (x != null && x.length - 0 === x.length);
};


function keys(o) {
  var r = [];
  if (o != null) {
    var i = 0, len = o.length;
    if (len - 0 === len) {
      for (; i < len; i++) {
        if (i in o) {
          r.push(i);
        }
      }
    } else {
      for (var p in o) {
        r.push(p);
      }
    }
  }
  return r;
}


function values(o) {
  var r = [];
  if (o != null) {
    var i = 0, len = o.length;
    if (len - 0 === len) {
      for (; i < len; i++) {
        if (i in o) {
          r.push(o[i]);
        }
      }
    } else {
      for (var p in o) {
        r.push(o[p]);
      }
    }
  }
  return r;
}


function forEach(target, iter, context) {
  if (target != null) {
    try {
      if (typeof target.forEach === 'function') {
        target.forEach(iter, context);
      } else {
        var i = 0, len = target.length;
        if (len - 0 === len) {
          for (; i < len; i++) {
            iter.call(context, target[i], i, target);
          }
        } else {
          for (var p in target) {
            iter.call(context, target[p], p, target);
          }
        }
      }
    } catch (e) {
      if (e !== StopIteration) {
        throw e;
      }
    }
  }
  return target;
}


function mixin(target) {
  Array.slice(arguments, 1).forEach(function(source) {
    var keys = Object.keys(source);
    for (var i = 0, len = keys.length; i < len; i++) {
      var key = keys[i];
      target[key] = source[key];
    }
  });
  return target;
}


function partial(func) {
  var rests = Array.slice(arguments, 1);
  return function() {
    var args = Array.slice(arguments);
    return func.apply(null, rests.concat(args));
  };
}


function bind(context, func) {
  return func.bind(context);
}


function getChromeURI(path) {
  return CHROME_DIR + path;
}


function getPages(callback) {
  var pages = [];
  var iter = WindowMediator.getEnumerator('navigator:browser');

  while (iter.hasMoreElements()) {
    try {
      var browser = iter.getNext();
      var tabbrowser = browser.gBrowser;

      for (var i = 0, len = tabbrowser.browsers.length; i < len; i++) {
        var tab = tabbrowser.tabContainer.childNodes[i];
        var win = tabbrowser.getBrowserAtIndex(i).contentDocument.defaultView;

        if (win && hasDocument(win)) {
          var doc = getDocument(win);
          var url = '' + doc.URL;

          if (callback(url, doc)) {
            pages.push({
              url: url,
              tab: tab,
              window: win,
              browser: browser,
              document: doc,
              tabbrowser: tabbrowser
            });
          }
        }
      }
    } catch (e) {
      error(e);
    }
  }
  return pages;
}


function getSelectedWindow() {
  var selectedBrowser = gBrowser.selectedBrowser;
  var doc = selectedBrowser && selectedBrowser.contentDocument;
  return doc && doc.defaultView;
}


function getSelectedTabURI() {
  var win = getSelectedWindow();
  var doc, uri = '';

  if (win) {
    if (hasDocument(win)) {
      doc = getDocument(win);
      uri = doc.URL;
    } else {
      uri = win.location && win.location.href;
    }
  }
  return '' + uri;
}


function hasDocument(win) {
  return !!(win.document || (win.content && win.content.document));
}


function getDocument(win) {
  if (win.document) {
    return win.document;
  }
  return win.content && win.content.document;
}


function isDocumentEnabled(doc) {
  try {
    return doc != null && doc.defaultView != null && doc.defaultView.document === doc;
  } catch (e) {
    // Ignore dead object error
  }
  return false;
}


function isWindowEnabled(win) {
  try {
    return win != null && hasDocument(win);
  } catch (e) {}
  return false;
}


function isElementEnabled(elem) {
  try {
    return elem != null && elem.nodeType === 1;
  } catch (e) {}
  return false;
}


function getHeader(doc) {
  try {
    var headers = doc.getElementsByTagName('header');
    return headers && headers[0];
  } catch (e) {
    // ignore dead object error
  }
}


function click(win, doc, elem) {
  simulateEvent(win, doc, 'click', elem);
}


function simulateEvent(win, doc, type, elem, ev) {
  var evt = doc.createEvent('MouseEvents');

  evt.initMouseEvent(
    type, true, true, win,
    1, 0, 0,
    ev ? ev.clientX || 0 : 0,
    ev ? ev.clientY || 0 : 0,
    false, false, false, false,
    0, null
  );
  elem.dispatchEvent(evt);
}


function setLabel(elem, label) {
  ['label', 'tooltiptext'].forEach(function(attr) {
    elem.setAttribute(attr, getMessage('label.' + label));
  });
}


function urlToPath(url) {
  return ('' + url).replace(/^https?:\/+[^\/]+/, '');
}


function getMessage(label, params) {
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


function getService(cid, ifc) {
  var c = Cc['@mozilla.org/' + cid + ';1'];
  if (!c) {
    return;
  }
  try {
    return ifc ? c.getService(ifc) : broad(c.getService());
  } catch (e) {}
}


function defineSymbolicObject(name) {
  var F = function() { return F; };
  F.message = name;
  F.toString = F.valueOf = function() {
    return objectStringified[0] + name + objectStringified[1];
  };
  F.prototype = new Error(name);
  F.prototype.constructor = F;
  F.prototype.constructor.prototype = F.constructor.prototype;
  return new F();
}


function createConstructor(Ctor, proto) {
  if (proto == null && typeof Ctor === 'object') {
    proto = Ctor, Ctor = (function(){});
  }
  if ('init' in proto) {
    Ctor = (function(Ctor_) {
      return function() {
        Ctor_ && Ctor_.apply(this, arguments);
        return this.init.apply(this, arguments) || this;
      };
    }(Ctor));
  }
  return Ctor.prototype = proto, proto.constructor = Ctor, Ctor;
}


var Timer = createConstructor({
  ids: null,
  init: function() {
    this.ids = {};
  },
  set: function(func, msec) {
    var that = this;
    var id = setTimeout(function() {
      try {
        func();
      } finally {
        that.clear(id);
      }
    }, msec || 0);

    this.ids[id] = id;
    return this;
  },
  clear: function(id) {
    if (id in this.ids && this.ids.hasOwnProperty(id)) {
      clearTimeout(id);
      delete this.ids[id];
    }
    return this;
  },
  clearAll: function() {
    var that = this;
    Object.keys(this.ids).forEach(function(id) {
      that.clear(id);
    });
    this.init();
    return this;
  }
});


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


function wrappedObject(obj) {
  return obj.wrappedJSObject || obj;
}


function getMostRecentWindow() {
  return WindowMediator.getMostRecentWindow('navigator:browser');
}


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


function isEmpty(obj) {
  for (var i in obj) {
    return false;
  }
  return true;
}


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


