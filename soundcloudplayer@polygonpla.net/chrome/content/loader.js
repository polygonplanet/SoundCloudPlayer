/*
 * SoundCloudPlayer : loader
 */
(function() {
'use strict';

const SCRIPT_FILES = [
  'utils.js',
  'async.js',
  'player.js'
];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

const CHROME_DIR  = 'chrome://soundcloudplayer';
const CONTENT_DIR = CHROME_DIR + '/content';
const MODULE_DIR  = CONTENT_DIR + '/modules';

var getScriptPath = function(js) {
  return MODULE_DIR + '/' + js;
};

var loadScripts = function(scope) {
  var loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
             .getService(Ci.mozIJSSubScriptLoader);

  SCRIPT_FILES.forEach(function(js) {
    loader.loadSubScript(getScriptPath(js), scope, 'UTF-8');
  });
};

var scope = {};

try {
  loadScripts(scope);
  scope.SoundCloudPlayer.initEvents();
} catch (e) {
  Cu.reportError(e);
}

}());
