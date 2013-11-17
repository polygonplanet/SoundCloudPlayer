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

var console = (function() {
  if (typeof console === 'undefined') {
    return {
      log: log,
      debug: log,
      error: error
    };
  }
  return console;
}());

var XMLHttpRequest = Components.Constructor('@mozilla.org/xmlextras/xmlhttprequest;1');
var XMLSerializer = Components.Constructor('@mozilla.org/xmlextras/xmlserializer;1');
var DOMParser = Components.Constructor('@mozilla.org/xmlextras/domparser;1');
var XPathEvaluator = Components.Constructor('@mozilla.org/dom/xpath-evaluator;1');
var XPathResult = Ci.nsIDOMXPathResult;

var toObjectString = Object.prototype.toString;
//var toFunctionString = Function.prototype.toString;

var typeOf = (function() {
  var types = {};
  var getType = function(type) {
    return '[object ' + type.toLowerCase().replace(/^(.)/, (a) => a.toUpperCase()) + ']';
  };

  'Boolean Number String Function Array Date RegExp Object Error'.split(' ').forEach((type) => {
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
    return toObjectString.call(o).match(/\s+([^\]]+)\]+$/)[1].toLowerCase();
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
    var i;
    var len = o.length;
    if (len - 0 === len) {
      for (i = 0; i < len; i++) {
        if (i in o) {
          r.push(i);
        }
      }
    } else {
      for (i in o) {
        r.push(i);
      }
    }
  }
  return r;
}


function values(o) {
  var r = [];
  if (o != null) {
    var i;
    var len = o.length;
    if (len - 0 === len) {
      for (i = 0; i < len; i++) {
        if (i in o) {
          r.push(o[i]);
        }
      }
    } else {
      for (i in o) {
        r.push(o[i]);
      }
    }
  }
  return r;
}


function each(target, iter, context) {
  if (target != null) {
    try {
      if (typeof target.forEach === 'function') {
        target.forEach(iter, context);
      } else {
        var i;
        var len = target.length;
        if (len - 0 === len) {
          for (i = 0; i < len; i++) {
            if (iter.call(context, target[i], i, target) === StopIteration) {
              break;
            }
          }
        } else {
          for (i in target) {
            if (iter.call(context, target[i], i, target) === StopIteration) {
              break;
            }
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


function mixin(target, source) {
  var keys = Object.keys(source);
  for (var i = 0, len = keys.length; i < len; i++) {
    var key = keys[i];
    target[key] = source[key];
  }
  return target;
}


function partial(func) {
  var rests = Array.slice(arguments, 1);
  return function() {
    var args = Array.slice(arguments);
    return func.apply(null, rests.concat(args));
  };
}


function getChromeURI(path) {
  return CHROME_DIR + path;
}


function getPages(callback) {
  var pages = [];
  var browserEnumerator = WindowMediator.getEnumerator('navigator:browser');

  while (browserEnumerator.hasMoreElements()) {
    try {
      var browser = browserEnumerator.getNext();
      var tabbrowser = browser.gBrowser;
      var browsersLen = tabbrowser.browsers.length;

      for (var i = 0, len = browsersLen; i < len; i++) {
        var ret = function(currentBrowser, tab) {
          var win = currentBrowser.contentDocument.defaultView;

          if (win && hasDocument(win)) {
            var doc = getDocument(win);
            var url = '' + doc.URL;

            if (callback(url, doc)) {
              return {
                url: url,
                tab: tab,
                window: win,
                browser: browser,
                document: doc,
                tabbrowser: tabbrowser
              };
            }
          }
        }(tabbrowser.getBrowserAtIndex(i),
          tabbrowser.tabContainer.childNodes[i]);

        if (ret) {
          pages.push(ret);
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


function observe(func, delay) {
  setTimeout(function observe() {
    var time = Date.now();
    if (func() !== false) {
      setTimeout(function() {
        observe();
      }, Math.min(1500, delay + (Date.now() - time)));
    }
  }, 0);
}


function click(win, doc, elem) {
  simulateEvent(win, doc, 'click', elem);
}


function simulateEvent(win, doc, type, elem, ev) {
  var evt = doc.createEvent('MouseEvents');

  if (ev) {
    evt.initMouseEvent(type, true, true, win,
      1, 0, 0, ev.clientX || 0, ev.clientY || 0,
      false, false, false, false,
      0, null
    );
  } else {
    evt.initMouseEvent(type, true, true, win,
      1, 0, 0, 0, 0,
      false, false, false, false,
      0, null
    );
  }
  elem.dispatchEvent(evt);
}


function hasClass(elem, className) {
  return elem.className.split(' ').indexOf(className) !== -1;
}


function addClass(elem, className) {
  var parts = elem.className.split(' ');
  var index = parts.indexOf(className);
  if (!~index) {
    elem.className += ' ' + className;
  }
  return elem;
}


function removeClass(elem, className) {
  var parts = elem.className.split(' ');
  var index = parts.indexOf(className);
  if (~index) {
    parts.splice(index, 1);
  }
  elem.className = parts.join(' ');
  return elem;
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
  var F = function() { return F };
  F.message = name;
  F.toString = F.valueOf = function() { return '[object ' + name + ']' };
  F.prototype = new Error(name);
  F.prototype.constructor = F;
  F.prototype.constructor.prototype = F.constructor.prototype;
  return new F();
}


function createConstructor(construct, proto) {
  if (proto == null && typeof construct === 'object') {
    proto = construct;
    construct = function(){};
  }
  construct.prototype = proto;
  proto.constructor = construct;
  return construct;
}


var Events = createConstructor(function Events(target) {
  this.target = target;
}, {
  add: function(type, func, cap) {
    var fn = function() {
      func.apply(func, arguments);
    };
    var c = !!cap;

    this.target.addEventListener(type, fn, c);

    this.data = {
      type: type,
      func: fn,
      cap: c
    };
    return this.data;
  },
  remove: function(data) {
    data = data || this.data;
    if (data) {
      this.target.removeEventListener(data.type, data.func, data.cap);
    }
  }
});


var Timer = createConstructor(function Timer() {
  return (this.ids = {}, this);
}, {
  set: function(func, msec) {
    var that = this;
    var id = setTimeout(function() {
      delete that.ids[id];
      func();
    }, msec || 0);

    this.ids[id] = func;
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
    this.ids = {};
    return this;
  }
});


/*
 * Functions from tombfix (tombloo fork) utilities.
 * https://github.com/tombfix/core
 * These code follows tombfix/tombloo license.
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


function queryString(params, question) {
  var queries;

  if (typeof params === 'string') {
    return params;
  }

  if (isEmpty(params)) {
    return '';
  }

  queries = [];

  for (var key in params) {
    if (params.hasOwnProperty(key)) {
      var value = params[key];
      if (value == null) {
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach(function(val) {
          queries.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
        });
      } else {
        queries.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
      }
    }
  }
  return (question ? '?' : '') + queries.join('&');
}


function request(url, options) {
  var req = new XMLHttpRequest();
  var d = new Deferred();
  var opts = mixin({}, options || {});
  var method = opts.method && opts.method.toUpperCase();
  var multipart = !!opts.multipart;
  var setHeader = true;
  var data, key, value;

  if (opts.sendContent) {
    var sendContent = opts.sendContent;

    if (opts.mode === 'raw') {
      data = sendContent;
    } else {
      for (key in sendContent) {
        if (typeof File !== 'undefined' && sendContent[key] instanceof File) {
          multipart = true;
          break;
        }
      }

      if (multipart && typeof FormData !== 'undefined') {
        data = new FormData();
        for (key in sendContent) {
          value = sendContent[key];
          if (value == null) {
            continue;
          }
          data.append(key, value);
        }
      } else {
        data = queryString(sendContent, false);
      }
    }
    method = method || 'POST';
  } else {
    if (opts.queryString) {
      url += queryString(opts.queryString, true);
    }
    method = method || 'GET';
  }

  req.mozBackgroundRequest = req.backgroundRequest = true;

  if ('username' in opts) {
    req.open(method, url, true, opts.username, opts.password);
  } else {
    req.open(method, url, true);
  }

  if (opts.responseType) {
    req.responseType = opts.responseType;
  }

  if (opts.charset) {
    req.overrideMimeType(opts.charset);
  }

  if (opts.headers) {
    if (opts.headers['Content-Type']) {
      setHeader = false;
    }
    Object.keys(opts.headers).forEach(function(key) {
      req.setRequestHeader(key, opts.headers[key]);
    });
  }

  if (opts.referrer) {
    req.setRequestHeader('Referer', opts.referrer);
  }

  if (setHeader && opts.sendContent && !multipart) {
    req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  }

  req.addEventListener('readystatechange', function() {
    if (req.readyState === 4) {
      if (req.status >= 200 && req.status < 300) {
        d.begin(req);
      } else {
        d.raise(req);
      }
    }
  });

  req.send(data || null);
  return d;
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


