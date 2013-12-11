'use strict';

log(this);

var ObjectListener = require('objectlistener');

var o = { a: 'abc' };
var listener = new ObjectListener(o);
listener.on('change:a', function(target, key, value) {
  log('changed! ' + value);
  return value;
});
o.a = 'abc';
o.a = 'abc';
o.a = 'zzz';   // changed! zzz
o.a = 'zzz';
o.a = 'Hello'; // changed! Hello







