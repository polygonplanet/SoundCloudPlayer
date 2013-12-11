/*
 * SoundCloudPlayer : components
 */

/*
 * Some functions are from tombfix (tombloo fork) utilities.
 * https://github.com/tombfix/core
 * These functions follows tombfix/tombloo license.
 */

'use strict';


const PREF_PREFIX = 'extensions.soundcloudplayer.';

const INTERFACES = [Ci[i] for (i in Ci)];


exports.broad = function(obj, ifcs = INTERFACES) {
  for (var i = 0, len = ifcs.length; i < len; i++) {
    try {
      if (obj instanceof ifcs[i]);
    } catch (e) {}
  }
  return obj;
};


exports.getService = function(cid, ifc, suffix = ';1') {
  var c = Cc['@mozilla.org/' + cid + suffix];

  if (!c) {
    return;
  }

  try {
    return ifc ? c.getService(ifc) : broad(c.getService());
  } catch (e) {}
};


const ConsoleService = getService('consoleservice', Ci.nsIConsoleService);
const WindowMediator = getService('appshell/window-mediator', Ci.nsIWindowMediator);
const PrefService    = getService('preferences-service', null);
const StringBundle   = getService('intl/stringbundle', Ci.nsIStringBundleService)
                     .createBundle(CHROME_DIR + '/locale/soundcloudplayer.properties');

exports.ConsoleService = ConsoleService;
exports.WindowMediator = WindowMediator;
exports.PrefService    = PrefService;
exports.StringBundle   = StringBundle;


var getPrefBranch = function() {
  return PrefService.getBranch('');
};


var getPrefType = function(key) {
  var branch = getPrefBranch();

  switch (branch.getPrefType(key)) {
    case branch.PREF_STRING  : return 'string';
    case branch.PREF_BOOL    : return 'boolean';
    case branch.PREF_INT     : return 'number';
    case branch.PREF_INVALID : default: return 'undefined';
  }
};


var setPrefValue = function() {
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
};


var getPrefValue = function() {
  var key = Array.join(arguments, '');
  var branch = getPrefBranch();

  switch (branch.getPrefType(key)) {
    case branch.PREF_STRING: return decodeURIComponent(escape(branch.getCharPref(key)));
    case branch.PREF_BOOL: return branch.getBoolPref(key);
    case branch.PREF_INT: return branch.getIntPref(key);
  }
};


exports.getPref = getPrefValue.call.bind(getPrefValue, null, PREF_PREFIX);
exports.setPref = setPrefValue.call.bind(setPrefValue, null, PREF_PREFIX);


exports.__ = function(label, args = null) {
  try {
    return args == null && StringBundle.GetStringFromName(label) ||
           StringBundle.formatStringFromName(label, args, args.length);
  } catch (e) {
    return '';
  }
};


exports.wrappedObject = function(obj) {
  return obj.wrappedJSObject || obj;
};


exports.getMostRecentWindow = function() {
  return WindowMediator.getMostRecentWindow('navigator:browser');
};


exports.addTab = function(url, background = false) {
  var d = new Deferred();
  var tabbrowser = getMostRecentWindow().getBrowser();
  var tab = tabbrowser.addTab(url);
  var browser = tab.linkedBrowser;

  if (!background) {
    tabbrowser.selectedTab = tab;
  }
  browser.addEventListener('DOMContentLoaded', function onLoad(event) {
    browser.removeEventListener('DOMContentLoaded', onLoad, true);
    d.resolve(wrappedObject(event.originalTarget.defaultView));
  }, true);

  return d;
};


exports.isEmpty = function(obj) {
  return Object.keys(obj).length === 0;
};


exports.clearObject = function(obj) {
  var keys = Object.keys(obj);
  for (var i = 0, len = keys.length; i < len; i++) {
    delete obj[keys[i]];
  }
  return obj;
};


exports.log = function(msg) {
  try {
    if (!firebug('log', arguments)) {
      throw false;
    }
  } catch (e) {
    ConsoleService.logStringMessage('' + msg);
  }
  return msg;
};


exports.error = function(err) {
  try {
    if (!firebug('error', arguments)) {
      throw false;
    }
  } catch (e) {
    Cu.reportError(err);
  }
  return err;
};


var firebug = function(method, args) {
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
};

