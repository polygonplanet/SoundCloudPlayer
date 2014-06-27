/*
 * SoundCloudPlayer : player
 */

'use strict';

var SoundCloudPlayer = {
  BASE_URL: 'https://soundcloud.com/',
  RE_BASE_URL: new RegExp('^https?://soundcloud\\.com/'),

  playerElements: {
    //TODO:
    // - Playback progress bar
    // - Repost button
    'soundcloudplayer-control-like': {
      removable: true,
      command: 'commandLike'
    },
    'soundcloudplayer-control-prev': {
      removable: true,
      command: 'commandPrev'
    },
    'soundcloudplayer-control-toggle': {
      removable: true,
      command: 'commandToggle'
    },
    'soundcloudplayer-control-next': {
      removable: true,
      command: 'commandNext'
    },
    'soundcloudplayer-control-title': {
      removable: true,
      command: 'commandTitle'
    },
    'soundcloudplayer-control-title-text': {
      removable: false,
      command: null,
    },
    'soundcloudplayer-control-volume': {
      removable: true,
      command: 'commandVolume'
    },
    'soundcloudplayer-control-volume-slider-wrapper': {
      removable: true,
      command: null
    },
    'soundcloudplayer-control-volume-slider': {
      removable: false
    },
    'soundcloudplayer-control-open': {
      removable: true,
      command: 'commandOpen'
    }
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
      className: 'volumeVertical',
      prop: 'volumePanel'
    },
    handle: {
      className: 'volumeVertical__handle',
      prop: 'volumeHandle'
    },
    slider: {
      className: 'volumeVertical__slider',
      prop: 'volumeSlider'
    }
  },
  elements: null,

  //XXX: Fix slider positions
  VOLUME_SLIDER_POSITIONS: [68, 60, 54, 48, 42, 36, 28, 23, 18, 12, 0],
  VOLUME_SLIDER_HEIGHT: 73,

  playControl: null,
  skipControlPrevious: null,
  skipControlNext: null,
  playbackTitle: null,
  volumePanel: null,
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
  closing: false,
  observing: false,
  stopObserve: false,
  playerEnabled: false,
  ignoreFindPage: false,
  isSliderChanging: false,
  ignoreVolumeSettings: false,
  isMute: false,
  isMuteInited: false,
  isVolumeInited: false,
  currentVolume: 0,
  restoreSetVolume: null,

  init: function() {
    if (!getPref('playerInstalled')) {
      var bar = document.getElementById('addon-bar');

      if (bar) {
        var cur = bar.currentSet;
        var elems = this.playerElements;

        // Remove the old SoundCloudPlayer version's <toolbarbutton/>
        Object.keys(elems).forEach(function(id) {
          if (elems[id].removable && ~cur.indexOf(id)) {
            cur = cur.split(new RegExp('(?:,|)' + id)).join('');
          }
        });
        bar.currentSet = cur.concat(',soundcloudplayer-player');
        bar.setAttribute('currentset', cur);
        document.persist(bar.id, 'currentset');

        setPref('playerInstalled', true);
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
          gBrowser.addEventListener('load', that.onTabLoad.bind(that), true);
          gBrowser.tabContainer.addEventListener('TabSelect', that.onTabSelect.bind(that), false);
        }, false);

        window.addEventListener('close', function() {
          if (that) {
            that.closing = true;
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
    var elems = this.playerElements;

    this.elements = {};

    Object.keys(elems).forEach(function(id) {
      var elem = document.getElementById(id);
      var command = elems[id].command;

      if (elem) {
        this.elements[id.split('-').pop()] = elem;
        if (command) {
          elem.addEventListener('command', this[command].bind(this), false);
        }
      }
    }, this);
  },
  addVolumeSliderEvents: (function() {
    var inited = false;

    return function() {
      if (inited) {
        return;
      }
      var slider = this.elements.slider;

      var changeSlider = (function(blur) {
        this.isSliderChanging = true;
        blur && slider.blur && slider.blur();
      }).bind(this);

      var changeSliderBlur = partial(changeSlider, true);

      if (slider) {
        try {
          slider.addEventListener('input', this.commandVolumeSliderInput.bind(this), false);
          slider.addEventListener('change', this.commandVolumeSliderChanging.bind(this), false);
          slider.addEventListener('mousedown', changeSlider, false);
          slider.addEventListener('mouseup', changeSliderBlur, false);
          slider.addEventListener('mouseleave', changeSliderBlur, false);
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
    if (!this.isPlayControlEnabled()) {
      return;
    }
    //XXX: playManager.isPlaying
    return this.playControl.classList.contains('playing');
  },
  //TODO: Reduce function initial check
  play: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }
    if (!this.isPlaying()) {
      //XXX: Use SoundCloud modules
      this.click(this.playControl);
    }
  },
  stop: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }
    if (this.isPlaying()) {
      this.click(this.playControl);
    }
  },
  toggle: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }
    this.click(this.playControl);
  },
  prev: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }
    this.click(this.skipControlPrevious);
  },
  next: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }
    this.click(this.skipControlNext);
  },

  getTitle: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }
    return ('' + this.playbackTitle.textContent).trim();
  },
  navigate: function(path) {
    if (!this.isDocumentEnabled()) {
      return;
    }
    this.window.require('config').get('router').navigate(path, true);
  },
  getCurrentSound: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }
    return this.window.require('lib/play-manager').getCurrentSound();
  },
  getCurrentPermalink: function() {
    var sound = this.getCurrentSound();
    if (sound) {
      return sound.attributes.permalink_url;
    }
  },
  getConfig: function(key) {
    if (!this.isDocumentEnabled()) {
      return;
    }
    return this.window.require('config').get(key);
  },
  isLiked: function(sound) {
    if (!this.isDocumentEnabled()) {
      return;
    }
    var SoundLikes = this.window.require('models/sound-likes');
    return new SoundLikes().get(sound.id);
  },
  like: function(sound) {
    var d = new Deferred();

    if (!this.isDocumentEnabled()) {
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
    if (!this.isPlayControlEnabled()) {
      return;
    }

    if (this.currentVolume != null) {
      return this.currentVolume;
    }
    return this.window.require('lib/audiomanager')._volume;
  },
  setCurrentTitle: function() {
    var title = this.getCurrentTitle();

    if (title != null && this.elements) {
      var elemTitle = this.elements.title;
      var elemText = this.elements.text;

      if (!elemTitle.disabled) {
        elemTitle.setAttribute('label', title);
        elemTitle.setAttribute('tooltiptext', title);
        elemText.textContent = title;
      }
    }
  },
  getElementTitle: function() {
    return this.elements ? ('' + this.elements.text.textContent).trim() : '';
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
    if (!this.isPlayControlEnabled() || this.ignoreVolumeSettings) {
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
      if (!this.isMute && this.isDocumentEnabled()) {
        this.window.require('lib/audiomanager').setVolume(vol);
        this.setVolumeStore(vol);
      }
    }
  },
  setVolumeStore: function(vol, isMute) {
    if (!this.isPlayControlEnabled()) {
      return false;
    }

    var volume = Math.min(1, Math.max(0, (vol - 0) || 0));
    var PersistentStore = this.window.require('lib/persistent-store');
    var volumeSettings = new PersistentStore('volume-settings');
    volumeSettings.set('volume', volume);

    if (!this.isMute && !isMute) {
      setPref('volume', ~~(volume * 10)|0);
    }
    return true;
  },
  toggleMute: function() {
    if (this.ignoreVolumeSettings || !this.isPlayControlEnabled()) {
      return false;
    }
    var audioManager = this.window.require('lib/audiomanager');

    if (this.isMute) {
      audioManager.setVolume(this.currentVolume);
      this.setVolumeStore(this.currentVolume);

      if (this.elements.volume) {
        this.elements.volume.classList.remove('mute');
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
        this.elements.volume.classList.add('mute');
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
  },
  toggleSliderMute: function() {
    if (this.ignoreVolumeSettings || !this.isPlayControlEnabled()) {
      return;
    }
    var button = this.volumePanel.querySelector('.volumeVertical__togglemute');
    if (button) {
      this.click(button);
      return true;
    }
    return false;
  },
  isSliderMuted: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }

    var volume = this.volumePanel;
    if (volume && volume.classList.contains('muted')) {
      return true;
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
    if (this.ignoreVolumeSettings || !this.isPlayControlEnabled()) {
      return;
    }

    var audioManager = this.window.require('lib/audiomanager');

    audioManager.setVolume(0);
    this.setVolumeStore(0);
    this.muteSlider();

    if (this.elements.volume) {
      this.elements.volume.classList.add('mute');
      setLabel(this.elements.volume, 'Unmute');
    }
  },
  // Bug? or problems on SoundCloud's SoundManager2:
  //
  // 1) Play any sound, then mutes by volume button.
  // 2) Open new SoundCloud tab, then play any sound.
  // A moment sound would come out.
  //
  // Resolve/Fix this problem.
  //XXX: __proto__
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
            try {
              if (that.isMute) {
                return setVolume_.call(this, 0);
              }
              return setVolume_.apply(this, arguments);
            } finally {
              if (that.restoreSetVolume) {
                that.restoreSetVolume();
              }
            }
          };
        } catch (e) {
          error(e);
          throw e;
        }
      }
    }
  },
  togglePlay: function() {
    if (!this.isPlayControlEnabled()) {
      return;
    }

    this.window.require('lib/play-manager').toggleCurrent({
      userInitiated: true
    });

    this.togglePlaying();
  },
  openSoundCloud: function() {
    if (this.isDocumentEnabled()) {
      this.tabbrowser.selectedTab = this.tab;
    } else {
      addTab(this.BASE_URL);
    }
  },
  togglePlayerDisabled: (function() {
    var prev = null;

    return function() {
      if (this.elements) {
        var enabled = !!this.isPlayControlEnabled();

        if (prev !== enabled) {
          var elems = this.elements;

          Object.keys(elems).forEach(function(key) {
            var elem = elems[key];

            switch (key) {
              case 'open':
                  return;
              case 'title':
                  if (!enabled) {
                    setLabel(elem, 'NotFoundSoundCloud');
                  }
                  break;
              case 'text':
                  if (!enabled) {
                    elem.textContent = '----------';
                  }
                  break;
              case 'slider':
                  if (enabled) {
                    elem.removeAttribute('disabled');
                  } else {
                    elem.setAttribute('disabled', 'true');
                  }
                  return;
            }
            elem.disabled = !enabled;
          });
        }
        prev = enabled;
      }
    };
  }()),
  togglePlaying: function() {
    var playing = false;
    if (this.elements && this.elements.toggle) {
      if (this.isPlaying()) {
        this.elements.toggle.classList.add('playing');
        setLabel(this.elements.toggle, 'Pause');
        playing = true;
      } else {
        this.elements.toggle.classList.remove('playing');
        setLabel(this.elements.toggle, 'Play');
      }
    }
    return playing;
  },
  setLikedClass: function() {
    if (!this.isDocumentEnabled()) {
      return;
    }

    if (this.elements && this.elements.like) {
      var sound = this.getCurrentSound();

      if (sound) {
        var liked = this.isLiked(sound);

        if (liked) {
          this.elements.like.classList.add('liked');
          setLabel(this.elements.like, 'Liked');
        } else {
          this.elements.like.classList.remove('liked');
          setLabel(this.elements.like, 'Like');
        }
      }
    }
  },
  findTab: function() {
    var page = this.findPage();
    if (page) {

      var header = this.getHeader(page.document);
      if (header) {

        if (this.isMute) {
          this.setMute();
        }

        mixin(this, page);
        if (this.isDocumentEnabled()) {
          return true;
        }
      }
    }
    return false;
  },
  findPage: function(onlyPlaying) {
    var pages = getPages(this.isSoundCloudPage.bind(this));
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
  },
  findActivePlayingPage: function(isPrevPlaying) {
    if (isPrevPlaying && !this.ignoreFindPage) {
      var page = this.findPage(true);

      if (page && page.window && page.window !== this.window) {
        var header = this.getHeader(page.document);

        if (header) {
          if (this.isMute) {
            this.setMute();
          }

          mixin(this, page);
          if (this.isDocumentEnabled()) {
            this.clearPlayControls();
            this.playerEnabled = false;

            if (this.getPlayControl()) {
              this.playerEnabled = true;
              return true;
            }
          }
        }
      }
    }
    return false;
  },
  assignWindow: function(win) {
    if (win != null &&
        typeof win.require !== 'function' &&
        typeof win.jQuery !== 'function') {
      return wrappedObject(win);
    }
    return win;
  },
  isDocumentEnabled: function() {
    try {
      return !!(this.window && this.document &&
                typeof this.document.querySelector === 'function');
    } catch (e) {
      // Ignore dead object error
    }
    return false;
  },
  isPlayControlEnabled: function() {
    return this.isDocumentEnabled() && this.playControl != null &&
           this.playControl.nodeType === 1 && this.isElementEnabled(this.playControl);
  },
  isElementEnabled: function(elem) {
    try {
      if (elem && elem.nodeType === 1) {
        return true;
      }
    } catch (e) {
      // Ignore dead object error
    }
    return false;
  },
  isSoundCloudPage: function(url) {
    return this.RE_BASE_URL.test(url);
  },
  isVolumeSliderEnabled: function() {
    if (!this.isPlayControlEnabled()) {
      return false;
    }
    return this.volumeSlider != null &&
           this.volumeSlider.clientHeight === this.VOLUME_SLIDER_HEIGHT;
  },
  moveVolumeSliderHandle: function(vol) {
    if (this.ignoreVolumeSettings || !this.isVolumeSliderEnabled() ||
        !this.isDocumentEnabled()) {
      return false;
    }

    var slider = this.window.jQuery(this.volumeSlider);
    var clientHeight = this.document.documentElement.clientHeight;

    var top = clientHeight - parseInt(slider.css('bottom'), 10) - slider.outerHeight();
    var height = this.VOLUME_SLIDER_POSITIONS[Math.floor(vol * 10)] || 0;
    var y = Math.round(top + height);

    this.simulateEvent('click', this.volumeSlider, {
      clientY: y
    });
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
    if (this.isDocumentEnabled()) {
      return true;
    }
    this.clearDocuments();
    return false;
  },
  checkPlayControls: function() {
    if (this.isPlayControlEnabled()) {
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
    this.volumePanel = null;
    this.volumeHandle = null;
    this.volumeSlider = null;
  },
  getHeader: function(doc) {
    try {
      var headers = doc.getElementsByTagName('header');
      return headers && headers[0];
    } catch (e) {
      // ignore dead object error
    }
  },
  getPlayingPage: function(pages) {
    if (pages) {
      for (var i = 0, len = pages.length; i < len; i++) {
        var page = pages[i];
        if (page && page.document) {
          var play = this.getPlayControlElement(page.document, 'playControl');
          if (play && play.classList.contains('playing')) {
            return page;
          }
        }
      }
    }
  },
  getPlayControlElement: function(doc, className) {
    if (doc && typeof doc.querySelector === 'function') {
      return doc.querySelector([
               '.playControls__wrapper .' + className,
               '.' + className
             ].join(','));
    }
  },
  getPlayControl: function() {
    if (!this.isDocumentEnabled() || this.isPlayControlEnabled()) {
      return;
    }
    var doc = this.document;
    var classes = this.playControlClasses;
    var elems = {};

    Object.keys(classes).forEach(function(type) {
      if (elems) {
        var className = classes[type].className;
        var prop = classes[type].prop;
        var elem = this.getPlayControlElement(doc, className);

        if (elem) {
          elems[prop] = elem;
        } else {
          elems = null;
        }
      }
    }, this);

    if (elems) {
      mixin(this, elems);
      return true;
    }
    return false;
  },
  click: function(elem) {
    if (!this.isDocumentEnabled()) {
      return;
    }
    click(this.window, this.document, elem);
  },
  simulateEvent: function(type, elem, ev) {
    if (!this.isDocumentEnabled()) {
      return;
    }
    simulateEvent(this.window, this.document, type, elem, ev);
  },
  observe: (function() {
    var errors = [];

    return function() {
      if (this.observing) {
        return;
      }
      var that = this;

      this.observing = true;
      async.observe(this.observeService.bind(this), this.interval).rescue(function(err) {
        var retry = false;

        if (that.observing || that.closing) {
          return;
        }

        errors.push(err);
        if (errors.length < 3) {
          retry = true;
        } else {
          if (!errors.slice(1).every(function(e) { return '' + e === '' + err })) {
            retry = true;
          }
          errors.shift();
        }

        //XXX: Retry
        if (retry) {
          async.wait(5).then(function() {
            log(err, 'SoundCloudPlayer: Retry observe');
            that.stopObserve = false;
            that.observe();
          });
        } else {
          error(err);
          throw err;
        }
      });
    };
  }()),
  observeService: (function() {
    var isPrevPlaying = null;

    return function() {
      try {
        this.checkDocuments();
        this.checkPlayControls();

        if (!this.isDocumentEnabled() &&
            this.findTab() && this.getPlayControl()) {
          this.playerEnabled = true;
        } else {
          this.playerEnabled = false;
        }

        if (this.isPlayControlEnabled()) {
          this.addVolumeTrapper();

          if (!this.isMuteInited && this.toggleMute()) {
            this.isMuteInited = true;
          }
          if (this.isMute) {
            this.setMute();
          }
          this.setLikedClass();

          if (!this.isSliderChanging && !this.ignoreVolumeSettings) {
            this.setCurrentVolume();
          }

          if (this.elements) {
            var playing = this.togglePlaying();

            if (playing) {
              isPrevPlaying = true;
            } else {
              if ((isPrevPlaying === null || isPrevPlaying) && !this.ignoreFindPage) {
                if (this.checkActiveWindow()) {
                  this.onTabSelect();
                } else {
                  this.findActivePlayingPage(true);
                }
              }
              isPrevPlaying = false;
            }
          }
        }
        this.togglePlayerDisabled();
        this.setCurrentTitle();
        this.togglePlaying();

        if (this.stopObserve) {
          this.observing = false;
          return false;
        }
      } catch (e) {
        this.observing = false;
        throw e;
      }
    };
  }()),
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

          if (this.isDocumentEnabled()) {
            this.clearPlayControls();
            this.playerEnabled = false;

            if (this.getPlayControl()) {
              this.playerEnabled = true;
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
      throw e;
    } finally {
      this.tabSelecting = false;
      this.ignoreVolumeSettings = false;
    }
    return false;
  }
};

