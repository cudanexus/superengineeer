/**
 * TV Browser Compatibility Module
 * Detects TV browsers and provides compatibility fixes
 */
(function() {
  'use strict';

  // TV browser detection patterns
  var tvPatterns = [
    /smart-tv/i,
    /smarttv/i,
    /googletv/i,
    /appletv/i,
    /hbbtv/i,
    /pov_tv/i,
    /netcast/i,
    /viera/i,
    /nettv/i,
    /roku/i,
    /dlnadoc/i,
    /ce-html/i,
    /tv build/i,
    /tizen/i,
    /webos/i,
    /lg browser/i,
    /samsung browser/i,
    /maple browser/i
  ];

  // Check if running on TV browser
  var userAgent = navigator.userAgent || '';
  var isTV = tvPatterns.some(function(pattern) {
    return pattern.test(userAgent);
  });

  // Also check for certain TV-specific properties
  if (!isTV && window.opera && window.opera.tv) {
    isTV = true;
  }

  // Set global flag
  window.isTV = isTV;

  if (isTV) {
    console.log('[TV Compat] TV browser detected:', userAgent);
  }

  // Provide console.error polyfill if missing
  if (typeof console === 'undefined') {
    window.console = {};
  }
  if (typeof console.error !== 'function') {
    console.error = console.log || function() {};
  }
  if (typeof console.warn !== 'function') {
    console.warn = console.log || function() {};
  }

  // Provide requestAnimationFrame polyfill for older TV browsers
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function(callback) {
      return setTimeout(callback, 16);
    };
  }

  // Provide classList polyfill for very old TV browsers
  if (!('classList' in document.createElement('div'))) {
    (function() {
      var prototype = Array.prototype;
      var indexOf = prototype.indexOf;
      var slice = prototype.slice;
      var push = prototype.push;
      var join = prototype.join;

      function DOMTokenList(element) {
        this._element = element;
        this._classes = element.className.trim().split(/\s+/);
      }

      DOMTokenList.prototype = {
        add: function(token) {
          if (indexOf.call(this._classes, token) < 0) {
            push.call(this._classes, token);
            this._element.className = join.call(this._classes, ' ');
          }
        },
        remove: function(token) {
          var index = indexOf.call(this._classes, token);
          if (index >= 0) {
            this._classes.splice(index, 1);
            this._element.className = join.call(this._classes, ' ');
          }
        },
        toggle: function(token) {
          if (indexOf.call(this._classes, token) >= 0) {
            this.remove(token);
          } else {
            this.add(token);
          }
        },
        contains: function(token) {
          return indexOf.call(this._classes, token) >= 0;
        }
      };

      Object.defineProperty(Element.prototype, 'classList', {
        get: function() {
          return new DOMTokenList(this);
        }
      });
    })();
  }

  // Add simplified error display overlay for TV browsers
  if (isTV) {
    window.resourceLoadError = function(element) {
      var url = element.src || element.href || 'unknown';
      var type = element.tagName.toLowerCase();

      // Create or update error overlay
      var overlay = document.getElementById('tv-error-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tv-error-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#b91c1c;color:white;padding:20px;z-index:9999;font-size:18px;font-family:monospace;';
        document.body.appendChild(overlay);
      }

      var errorText = 'Failed to load ' + type + ': ' + url;
      overlay.innerHTML += '<div>' + errorText + '</div>';

      // Also log to console
      console.error('[TV Compat] Resource load failed:', errorText);

      // Auto-hide after 10 seconds
      setTimeout(function() {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 10000);
    };
  }

  // TV-specific CSS adjustments
  if (isTV) {
    var style = document.createElement('style');
    style.textContent = [
      '/* TV Browser Compatibility Styles */',
      'body { font-size: 18px !important; }',
      'button { min-width: 60px !important; min-height: 44px !important; }',
      'input, textarea { font-size: 18px !important; }',
      '.text-xs { font-size: 14px !important; }',
      '.text-sm { font-size: 16px !important; }',
      '.space-y-1 > * + * { margin-top: 0.5rem !important; }',
      '.animate-pulse { animation: none !important; }',
      '.transition-all { transition: none !important; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Expose compatibility info
  window.tvCompat = {
    isTV: isTV,
    userAgent: userAgent,
    checkResourceSupport: function() {
      var support = {
        webSocket: typeof WebSocket !== 'undefined',
        localStorage: typeof localStorage !== 'undefined',
        sessionStorage: typeof sessionStorage !== 'undefined',
        json: typeof JSON !== 'undefined',
        querySelector: typeof document.querySelector === 'function',
        addEventListener: typeof window.addEventListener === 'function',
        xhr: typeof XMLHttpRequest !== 'undefined',
        promise: typeof Promise !== 'undefined'
      };

      console.log('[TV Compat] Feature support:', support);
      return support;
    }
  };

  // Log compatibility check on load
  if (isTV) {
    window.tvCompat.checkResourceSupport();
  }

})();