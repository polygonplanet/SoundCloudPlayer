/*
 * SoundCloudPlayer : player
 */

'use strict';

var SoundCloudPlayer = {
  BASE_URL: 'https://soundcloud.com/',

  statusbarItems: {
    //TODO: play time
    'soundcloudplayer-control-like'          : 'commandLike',
    'soundcloudplayer-control-prev'          : 'commandPrev',
    'soundcloudplayer-control-toggle'        : 'commandToggle',
    'soundcloudplayer-control-next'          : 'commandNext',
    'soundcloudplayer-control-title'         : 'commandTitle',
    'soundcloudplayer-control-volume'        : 'commandVolume',
    'soundcloudplayer-control-volume-slider' : 'commandVolumeSlider',
    'soundcloudplayer-control-open'          : 'commandOpen'
  },
  playControlClasses: {
    prev: {
      className: 'skipControl__previous',
      prop: 'skipControlPrevious'
    },
    play: {
      className: 'playControl',
      prop: 'playControl'
    },
    next: {
      className: 'skipControl__next',
      prop: 'skipControlNext'
    },
    title: {
      className: 'playbackTitle',
      prop: 'playbackTitle'
    },
    mute: {
      className: 'header__volume',
      prop: 'headerVolume'
    },
    handle: {
      className: 'volume__handle',
      prop: 'volumeHandle'
    },
    slider: {
      className: 'volume__slider',
      prop: 'volumeSlider'
    }
  },
  elements: null,

  //XXX: calc positions
  VOLUME_SLIDER_POSITIONS: [0, 10, 15, 18, 22, 26, 30, 34, 37, 41, 48, 53],
  VOLUME_SLIDER_WIDTH: 53,

  playControl: null,
  skipControlPrevious: null,
  skipControlNext: null,
  playbackTitle: null,
  headerVolume: null,
  volumeHandle: null,
  volumeSlider: null,

  url: null,
  tab: null,
  window: null,
  browser: null,
  document: null,
  tabbrowser: null,

  header: null,
  interval: 1000,
  observing: false,
  stopObserve: false,
  playerAvailable: false,
  ignoreFindPage: false,
  isSliderChanging: false,
  ignoreVolumeSettings: false,
  isMute: false,
  isMuteInited: false,
  isVolumeInited: false,
  currentVolume: 0,
  restoreSetVolume: null,

  init: function() {
    var inited = getPref('inited');
    var likeInited = getPref('likeInited');
    var bar = document.getElementById('addon-bar');

    if (bar) {
      var cur = bar.currentSet;
      var addButton = function(id, next) {
        if (!~cur.indexOf(id)) {
          if (next) {
            cur = cur.split(next).join(id + ',' + next);
          } else {
            cur = cur.concat(',' + id);
          }
          bar.currentSet = cur;
          bar.setAttribute('currentset', cur);
          document.persist(bar.id, 'currentset');
        }
      };

      if (!inited) {
        Object.keys(this.statusbarItems).forEach(function(id) {
          if (/-slider$/.test(id)) {
            id += '-wrapper';
          }
          addButton(id);
        });
        setPref('inited', true);
      }

      if (!likeInited) {
        var keys = Object.keys(this.statusbarItems);
        addButton.apply(this, keys);
        setPref('likeInited', true);
      }
    }
    this.initVolume();
    this.addEvents();
    this.addVolumeSliderEvents();
    this.observe();
  },
  initVolume: function() {
    if (!this.isVolumeInited) {
      this.currentVolume = ((getPref('volume') - 0) || 0) / 10;
      this.isMute = !getPref('muted');
      this.isVolumeInited = true;
      this.isMuteInited = false;
    }
  },
  initEvents: (function() {
    var registered = false;

    return function() {
      if (registered) {
        return;
      }
      var that = this;

      try {
        window.addEventListener('load', function() {
          that.init();

          gBrowser.addEventListener('load', function() {
            that.onTabLoad.apply(that, arguments);
          }, true);

          var tabContainer = gBrowser.tabContainer;

          tabContainer.addEventListener('TabSelect', function() {
            that.onTabSelect.apply(that, arguments);
          }, false);

        }, false);

        window.addEventListener('aftercustomization', function() {
          that.init();
        }, false);

        window.addEventListener('close', function() {
          if (that) {
            that.stopObserve = true;
          }
        }, false);

      } finally {
        registered = true;
      }
    };
  }()),
  addEvents: function() {
    if (this.elements) {
      return;
    }
    var that = this;
    var items = this.statusbarItems;

    this.elements = {};

    Object.keys(items).forEach(function(id) {
      var method = items[id];

      if (method !== null) {
        var elem = document.getElementById(id);

        if (!/volume-slider/.test(id)) {
          elem.addEventListener('command', function() {
            that[method]();
          }, false);
        }

        that.elements[id.split('-').pop()] = elem;
      }
    });
  },
  addVolumeSliderEvents: (function() {
    var inited = false;

    return function() {
      if (inited) {
        return;
      }
      var that = this;
      var slider = this.elements.slider;

      if (slider) {
        try {
          slider.addEventListener('input', function() {
            that.commandVolumeSliderInput();
          }, false);

          slider.addEventListener('change', function() {
            that.commandVolumeSliderChanging();
          }, false);

          slider.addEventListener('mousedown', function() {
            that.isSliderChanging = true;
          }, false);

          slider.addEventListener('mouseup', function() {
            that.isSliderChanging = false;
            slider.blur();
          }, false);

          slider.addEventListener('mouseleave', function() {
            that.isSliderChanging = false;
            slider.blur();
          }, false);

          that.isSliderChanging = false;
        } finally {
          inited = true;
        }
      }
    };
  }()),

  commandLike: function() {
    var that = this;
    var sound = this.getCurrentSound();
    if (sound) {
      this.like(sound).then(function() {
        that.setLikedClass();
      });
    }
  },
  commandPrev: function() {
    this.prev();
  },
  commandToggle: function() {
    this.ignoreFindPage = true;
    try {
      this.togglePlay();
    } finally {
      this.ignoreFindPage = false;
    }
  },
  commandNext: function() {
    this.next();
  },
  commandTitle: function() {
    var that = this;
    var url = this.getCurrentPermalink();

    if (url != null) {
      var path = urlToPath(url);

      if (path) {
        this.openSoundCloud();

        async.till(function() {
          return !!(that.window && that.isSoundCloudPage(getSelectedTabURI()));
        }, 3).then(function() {
          that.navigate(path);
        });
      }
    }
  },
  commandVolume: function() {
    this.toggleMute();
  },
  commandVolumeSlider: function() {
    var vol = (this.elements.slider.value - 0) / 10;
    this.setVolume(vol);
  },
  commandVolumeSliderInput: function() {
    this.commandVolumeSlider();
    this.isSliderChanging = true;
  },
  commandVolumeSliderChanging: function() {
    this.isSliderChanging = false;
    this.commandVolumeSlider();
  },
  commandOpen: function() {
    this.openSoundCloud();
  },

  isPlaying: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }
    //XXX: playManager.isPlaying
    return hasClass(this.playControl, 'playing');
  },
  play: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }
    if (!this.isPlaying()) {
      this.click(this.playControl);
    }
  },
  stop: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }
    if (this.isPlaying()) {
      this.click(this.playControl);
    }
  },
  toggle: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }
    this.click(this.playControl);
  },
  prev: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }
    this.click(this.skipControlPrevious);
  },
  next: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }
    this.click(this.skipControlNext);
  },

  getTitle: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }
    return ('' + this.playbackTitle.textContent).trim();
  },
  navigate: function(path) {
    if (!this.isDocumentAvailable()) {
      return;
    }

    try {
      this.window.require('config').get('router').navigate(path, true);
    } catch (e) {
      error(e);
    }
  },
  getCurrentSound: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }

    try {
      return this.window.require('lib/play-manager').getCurrentSound();
    } catch (e) {
      error(e);
    }
  },
  getCurrentPermalink: function() {
    var sound = this.getCurrentSound();
    if (sound) {
      return sound.attributes.permalink_url;
    }
  },
  getConfig: function(key) {
    if (!this.isDocumentAvailable()) {
      return;
    }
    try {
      return this.window.require('config').get(key);
    } catch (e) {
      error(e);
    }
  },
  isLiked: function(sound) {
    if (!this.isDocumentAvailable()) {
      return;
    }
    try {
      var id = sound.id;
      var SoundLikes = this.window.require('models/sound-likes');
      var sl = new SoundLikes();
      return sl.get(id);
    } catch (e) {
      error(e);
    }
  },
  like: function(sound) {
    var d = new Deferred();

    if (!this.isDocumentAvailable()) {
      return d.raise();
    }

    try {
      //XXX: sound.playlist.id
      var id = sound.id;
      var type = sound.resource_type;

      this.window.require('lib/action-controller').like(id, type).then(function(res) {
        d.begin(res);
      });
    } catch (e) {
      d.raise(e);
    }
    return d;
  },
  getCurrentTitle: function() {
    var title = this.getTitle();
    if (title != null) {
      return title;
    }

    var sound = this.getCurrentSound();
    if (sound) {
      return sound.attributes.title;
    }
    return '';
  },
  getCurrentVolume: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }

    if (this.currentVolume != null) {
      return this.currentVolume;
    }

    try {
      return this.window.require('lib/audiomanager')._volume;
    } catch (e) {
      error(e);
    }
  },
  setCurrentTitle: function() {
    var title = this.getCurrentTitle();

    if (title != null && this.elements.title) {
      this.elements.title.setAttribute('label', title);
      this.elements.title.setAttribute('tooltiptext', title);

      var stack = this.elements.title.childNodes[0];
      if (stack && typeof stack.textContent !== 'undefined') {
        stack.textContent = title;
      }
    }
  },
  getElementTitle: function() {
    if (this.elements.title) {
      var stack = this.elements.title.childNodes[0];
      if (stack && typeof stack.textContent !== 'undefined') {
        return ('' + stack.textContent).trim();
      }
    }
    return '';
  },
  setCurrentVolume: function() {
    if (this.ignoreVolumeSettings) {
      return;
    }
    var vol = this.getCurrentVolume();

    if (this.isMute) {
      if (vol != null && vol > 0 && this.currentVolume !== vol) {
        this.currentVolume = vol;
      }
      this.setMute();
    } else {
      if (vol != null && vol > 0 && this.currentVolume !== vol) {
        if (this.currentVolume !== vol) {
          this.currentVolume = vol;
        }
        if (this.elements && this.elements.slider) {
          this.elements.slider.value = vol * 10;
        }
      }
    }
  },
  setVolume: function(vol) {
    if (!this.isPlayControlAvailable() || this.ignoreVolumeSettings) {
      return;
    }
    this.currentVolume = vol;

    if (!this.isSliderChanging && this.isVolumeSliderEnabled()) {
      if (this.isMute) {
        this.muteSlider();
      } else {
        this.moveVolumeSliderHandle(vol);
      }
    } else {
      if (!this.isMute) {
        try {
          this.window.require('lib/audiomanager').setVolume(vol);
          this.setVolumeStore(vol);
        } catch (e) {
          error(e);
        }
      }
    }
  },
  setVolumeStore: function(vol, isMute) {
    if (!this.isPlayControlAvailable()) {
      return;
    }

    try {
      var volume = Math.min(1, Math.max(0, (vol - 0) || 0));
      var PersistentStore = this.window.require('lib/persistent-store');
      var volumeSettings = new PersistentStore('volume-settings');
      volumeSettings.set('volume', volume);

      if (!this.isMute && !isMute) {
        setPref('volume', ~~(volume * 10));
      }

      return true;
    } catch (e) {
      error(e);
    }
  },
  toggleMute: function() {
    if (this.ignoreVolumeSettings || !this.isPlayControlAvailable()) {
      return;
    }

    try {
      var audioManager = this.window.require('lib/audiomanager');

      if (this.isMute) {
        audioManager.setVolume(this.currentVolume);
        this.setVolumeStore(this.currentVolume);

        if (this.elements.volume) {
          removeClass(this.elements.volume, 'mute');
          setLabel(this.elements.volume, 'Mute');
        }
        if (this.elements.slider) {
          this.elements.slider.value = this.currentVolume * 10;
        }

        if (this.isVolumeSliderEnabled()) {
          this.moveVolumeSliderHandle(this.currentVolume);
        }
      } else {
        audioManager.setVolume(0);
        this.setVolumeStore(0, true);

        if (this.elements.volume) {
          addClass(this.elements.volume, 'mute');
          setLabel(this.elements.volume, 'Unmute');
        }
        if (this.elements.slider) {
          this.elements.slider.value = 0;
        }

        if (this.isVolumeSliderEnabled()) {
          this.muteSlider();
        }
      }

      this.isMute = !this.isMute;
      this.isMuteInited = true;
      setPref('muted', this.isMute);

      return true;
    } catch (e) {
      error(e);
    }
    return false;
  },
  toggleSliderMute: function() {
    if (this.ignoreVolumeSettings || !this.isPlayControlAvailable()) {
      return;
    }

    try {
      var button = this.headerVolume.querySelector('.volume__togglemute');
      if (button) {
        this.click(button);
        return true;
      }
    } catch (e) {
      error(e);
    }
  },
  isSliderMuted: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }

    try {
      var volume = this.headerVolume.querySelector('.volume');
      if (volume && hasClass(volume, 'muted')) {
        return true;
      }
    } catch (e) {
      error(e);
    }
    return false;
  },
  muteSlider: function() {
    if (this.ignoreVolumeSettings) {
      return;
    }
    return this.isSliderMuted() ? true : this.toggleSliderMute();
  },
  setMute: function() {
    if (this.ignoreVolumeSettings || !this.isPlayControlAvailable()) {
      return;
    }

    try {
      var audioManager = this.window.require('lib/audiomanager');

      audioManager.setVolume(0);
      this.setVolumeStore(0);
      this.muteSlider();

      if (this.elements.volume) {
        addClass(this.elements.volume, 'mute');
        setLabel(this.elements.volume, 'Unmute');
      }
    } catch (e) {
      error(e);
    }
  },
  addVolumeTrapper: function() {
    var that = this;

    if (this.isMute && !this.restoreSetVolume) {
      var win = this.window;

      if (win && win.require) {
        try {
          var audioManager = win.require('lib/audiomanager');
          var setVolume_ = audioManager.__proto__.setVolume;

          this.restoreSetVolume = function() {
            try {
              audioManager.__proto__.setVolume = setVolume_;
            } finally {
              that.restoreSetVolume = null;
              if (!that.isSliderChanging && !that.ignoreVolumeSettings) {
                var vol = that.getCurrentVolume();
                if (vol != null) {
                  that.setVolume(vol);
                }
              }
            }
          };

          audioManager.__proto__.setVolume = function(vol) {
            if (that.isMute) {
              return 0;
            }
            try {
              return setVolume_.apply(this, arguments);
            } finally {
              if (that.restoreSetVolume) {
                that.restoreSetVolume();
              }
            }
          };
        } catch (e) {
          error(e);
        }
      }
    }
  },
  togglePlay: function() {
    if (!this.isPlayControlAvailable()) {
      return;
    }

    try {
      this.window.require('lib/play-manager').toggleCurrent({
        userInitiated: true
      });

      this.setToggleClass();
    } catch (e) {
      error(e);
    }
  },
  openSoundCloud: function() {
    if (this.isDocumentAvailable()) {
      this.tabbrowser.selectedTab = this.tab;
    } else {
      addTab(this.BASE_URL);
    }
  },
  setToggleClass: function() {
    var isPlaying = false;
    if (this.elements && this.elements.toggle) {
      if (this.isPlaying()) {
        addClass(this.elements.toggle, 'playing');
        setLabel(this.elements.toggle, 'Pause');
        isPlaying = true;
      } else {
        removeClass(this.elements.toggle, 'playing');
        setLabel(this.elements.toggle, 'Play');
      }
    }
    return isPlaying;
  },
  setLikedClass: function() {
    if (!this.isDocumentAvailable()) {
      return;
    }

    if (this.elements && this.elements.like) {
      var sound = this.getCurrentSound();

      if (sound) {
        var liked = this.isLiked(sound);

        if (liked) {
          addClass(this.elements.like, 'liked');
          setLabel(this.elements.like, 'Liked');
        } else {
          removeClass(this.elements.like, 'liked');
          setLabel(this.elements.like, 'Like');
        }
      }
    }
  },
  findTab: function() {
    try {
      var page = this.findPage();
      if (page) {

        var header = this.getHeader(page.document);
        if (header) {

          if (this.isMute) {
            this.setMute();
          }

          mixin(this, page);
          if (this.isDocumentAvailable()) {
            return true;
          }
        }
      }
    } catch (e) {
      error(e);
      this.stopObserve = true;
    }
    return false;
  },
  findPage: function(onlyPlaying) {
    try {
      var pages = getPages(this.isSoundCloudPage);
      if (pages) {
        var page = this.getPlayingPage(pages);

        if (!onlyPlaying && !page) {
          page = pages[0];
        }

        if (page && page.window) {
          page.window = this.assignWindow(page.window);
          return page;
        }
      }
    } catch (e) {
      error(e);
      this.stopObserve = true;
    }
  },
  findActivePlayingPage: function(isPrevPlaying) {
    try {
      if (isPrevPlaying && !this.ignoreFindPage) {
        var page = this.findPage(true);

        if (page && page.window && page.window !== this.window) {
          var header = this.getHeader(page.document);

          if (header) {
            if (this.isMute) {
              this.setMute();
            }

            mixin(this, page);
            if (this.isDocumentAvailable()) {
              this.clearPlayControls();
              this.playerAvailable = false;

              if (this.getPlayControl()) {
                this.playerAvailable = true;
                return true;
              }
            }
          }
        }
      }
    } catch (e) {
      error(e);
      this.stopObserve = true;
    }
    return false;
  },
  assignWindow: function(win) {
    try {
      if (win) {
        if (typeof win.require !== 'function' &&
            typeof win.jQuery !== 'function') {
          return wrappedObject(win);
        }
      }
    } catch (e) {}
    return win;
  },
  isDocumentAvailable: function() {
    // Ignore dead object error.
    try {
      return !!(this.window && this.document &&
                typeof this.document.querySelector === 'function');
    } catch (e) {}
    return false;
  },
  isPlayControlAvailable: function() {
    return this.isDocumentAvailable() && this.playControl != null &&
           this.playControl.nodeType === 1 && this.isElementAvailable(this.playControl);
  },
  isElementAvailable: function(elem) {
    try {
      // Check dead object
      if (elem && elem.nodeType === 1 && (elem.getAttribute('test') || true)) {
        return true;
      }
    } catch (e) {}
    return false;
  },
  isSoundCloudPage: function(url) {
    return /^https?:\/\/soundcloud\.com\//.test(url);
  },
  isVolumeSliderEnabled: function() {
    if (!this.isPlayControlAvailable()) {
      return false;
    }
    return this.volumeSlider != null && this.volumeSlider.clientWidth === this.VOLUME_SLIDER_WIDTH;
  },
  moveVolumeSliderHandle: function(vol) {
    if (this.ignoreVolumeSettings || !this.isVolumeSliderEnabled()) {
      return false;
    }

    try {
      var $ = this.window.jQuery;
      var left =  $(this.volumeSlider).offset().left;
      var width = this.VOLUME_SLIDER_POSITIONS[Math.floor(vol * 10)] || 0;
      var x = Math.round(left + width);

      this.simulateEvent('click', this.volumeSlider, {
        clientX: x
      });
    } catch (e) {
      error(e);
    }
  },
  checkActiveWindow: function() {
    var win = getSelectedWindow();
    if (win && win !== this.window && hasDocument(win)) {
      var doc = getDocument(win);
      var url = '' + doc.URL;

      if (this.isSoundCloudPage(url)) {
        return true;
      }
    }
    return false;
  },
  checkDocuments: function() {
    if (this.isDocumentAvailable()) {
      return true;
    }
    this.clearDocuments();
    return false;
  },
  checkPlayControls: function() {
    if (this.isPlayControlAvailable()) {
      return true;
    }
    this.clearPlayControls();
    return false;
  },
  clearDocuments: function() {
    this.url = null;
    this.tab = null;
    this.window = null;
    this.browser = null;
    this.document = null;
    this.tabbrowser = null;
  },
  clearPlayControls: function() {
    this.playControl = null;
    this.skipControlPrevious = null;
    this.skipControlNext = null;
    this.playbackTitle = null;
    this.headerVolume = null;
    this.volumeHandle = null;
    this.volumeSlider = null;
  },
  getHeader: function(doc) {
    try {
      var headers = doc.getElementsByTagName('header');

      return headers && headers[0];
    } catch (e) {}
  },
  getPlayingPage: function(pages) {
    if (pages) {
      for (var i = 0, len = pages.length; i < len; i++) {
        var page = pages[i];
        if (page && page.document) {
          var play = this.getPlayControlElement(page.document, 'playControl');
          if (play && hasClass(play, 'playing')) {
            return page;
          }
        }
      }
    }
  },
  getPlayControlElement: function(doc, className) {
    if (doc && typeof doc.querySelector === 'function') {
      return doc.querySelector('.header__playbackControl .' + className)  ||
             doc.querySelector('.header__playbackControls .' + className) ||
             doc.querySelector('.' + className);
    }
  },
  getPlayControl: function() {
    if (!this.isDocumentAvailable() || this.isPlayControlAvailable()) {
      return;
    }
    var that = this;
    var doc = this.document;
    var classes = this.playControlClasses;
    var elems = {};

    Object.keys(classes).forEach(function(type) {
      if (elems) {
        var className = classes[type].className;
        var prop = classes[type].prop;
        var elem = that.getPlayControlElement(doc, className);

        if (elem) {
          elems[prop] = elem;
        } else {
          elems = null;
        }
      }
    });

    if (elems) {
      mixin(this, elems);
      return true;
    }
    return false;
  },
  click: function(elem) {
    if (!this.isDocumentAvailable()) {
      return;
    }
    click(this.window, this.document, elem);
  },
  simulateEvent: function(type, elem, ev) {
    if (!this.isDocumentAvailable()) {
      return;
    }
    simulateEvent(this.window, this.document, type, elem, ev);
  },
  observe: function() {
    if (this.observing) {
      return;
    }
    var that = this;
    var isPrevPlaying = null;

    async.observe(function() {
      try {
        that.checkDocuments();
        that.checkPlayControls();

        if (!that.isDocumentAvailable()) {
          if (that.getElementTitle()) {
            that.setCurrentTitle();
            that.setToggleClass();
          }
          if (that.findTab() && that.getPlayControl()) {
            that.playerAvailable = true;
          }
        }

        if (that.isPlayControlAvailable()) {
          that.addVolumeTrapper();

          if (!that.isMuteInited && that.toggleMute()) {
            that.isMuteInited = true;
          }
          that.setCurrentTitle();
          that.setLikedClass();

          if (!that.isSliderChanging && !that.ignoreVolumeSettings) {
            that.setCurrentVolume();
          }

          if (that.elements.toggle) {
            var isPlaying = that.setToggleClass();

            if (isPlaying) {
              isPrevPlaying = true;
            } else {
              if ((isPrevPlaying === null || isPrevPlaying) && !that.ignoreFindPage) {
                if (that.checkActiveWindow()) {
                  that.onTabSelect();
                } else {
                  that.findActivePlayingPage(true);
                }
              }
              isPrevPlaying = false;
            }
          }
        }

        if (that.stopObserve) {
          that.observing = false;
          return false;
        }
      } catch (e) {
        error(e);
        that.observing = false;
        return false;
      }
    }, this.interval).ensure(function(res) {
      //log(res, 'Stopped Observe');
    });

    this.observing = true;
  },
  onTabLoad: function(event) {
    if (event.originalTarget instanceof HTMLDocument) {
      var win = event.originalTarget.defaultView;

      if (win) {
        if (win.frameElement) {
          // ignore <frame/>/<iframe/> elements.
          return;
        }

        if (win !== this.window) {
          this.onTabSelect();
        }
      }
    }
  },
  onTabSelect: function(event) {
    var that = this;

    this.tabSelecting = true;
    this.ignoreVolumeSettings = true;

    try {
      if (this.isPlaying()) {
        if (this.isMute) {
          this.setMute();
        }
        return false;
      }
      var win = getSelectedWindow();

      if (win && hasDocument(win)) {
        var doc = getDocument(win);
        var url = '' + doc.URL;

        if (!this.isSoundCloudPage(url)) {
          return;
        }

        var play = this.getPlayControlElement(doc, 'playControl');
        if (!play) {
          return;
        }

        if (!this.playControl || this.playControl !== play) {
          var pages = getPages(function(url, d) {
            return that.isSoundCloudPage(url) && d === doc;
          });

          if (!pages || !pages[0] || pages[0].document !== doc) {
            return;
          }
          var page = pages[0];
          if (!page || !page.window) {
            return;
          }
          page.window = this.assignWindow(page.window);

          var header = this.getHeader(page.document);
          if (!header) {
            return;
          }
          if (this.isMute) {
            this.setMute();
          }
          mixin(this, page);

          if (this.isDocumentAvailable()) {
            this.clearPlayControls();
            this.playerAvailable = false;

            if (this.getPlayControl()) {
              this.playerAvailable = true;
              if (!this.isMuteInited && this.toggleMute()) {
                this.isMuteInited = true;
              }
              if (this.isMute) {
                this.setMute();
              }
              return true;
            }
          }
        }
      }
    } catch (e) {
      error(e);
    } finally {
      this.tabSelecting = false;
      this.ignoreVolumeSettings = false;
    }
    return false;
  }
};


