/**
 * Resource Monitor Module
 * Tracks loading of all page resources (scripts, styles, images) and reports failures
 */
(function(root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    // Node/CommonJS
    module.exports = factory();
  } else {
    // Browser globals
    root.ResourceMonitor = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var resourceStats = {
    total: 0,
    loaded: 0,
    failed: 0,
    pending: 0,
    resources: []
  };

  var errorCallback = null;
  var resourceCallback = null; // Callback for all resource events
  var observer = null;
  var startTime = Date.now();
  var statsCallback = null; // Callback for periodic stats broadcasts
  var broadcastInterval = null;
  var lastBroadcastStats = null;

  /**
   * Get client information
   */
  function getClientInfo() {
    return {
      userAgent: navigator.userAgent || 'Unknown',
      platform: navigator.platform || 'Unknown',
      language: navigator.language || 'Unknown',
      screenResolution: (window.screen ? window.screen.width + 'x' + window.screen.height : 'Unknown'),
      viewport: window.innerWidth + 'x' + window.innerHeight,
      cookiesEnabled: navigator.cookieEnabled,
      online: navigator.onLine,
      clientId: sessionStorage.getItem('superengineer-v5-client-id') || 'Unknown'
    };
  }

  /**
   * Track a resource
   */
  function trackResource(element, type, isExisting) {
    // Only use getAttribute to avoid browser-resolved URLs (TV browser fix)
    var url = element.getAttribute('src') || element.getAttribute('href');
    if (!url) {
      // For inline scripts or elements without src/href, skip tracking
      return;
    }

    // Normalize all relative URLs (not just those starting with '/')
    if (url && !url.match(/^https?:\/\//)) {
      var base = window.location.protocol + '//' + window.location.host;
      if (url.startsWith('/')) {
        // Absolute path
        url = base + url;
      } else if (url.startsWith('./') || url.startsWith('../')) {
        // Relative path with ./ or ../
        var currentPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        url = base + currentPath + '/' + url;
      } else if (!url.includes('://')) {
        // Relative path without prefix (e.g., "js/app.js")
        var currentPath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        url = base + currentPath + '/' + url;
      }
    }

    // Check if resource is already loaded (for existing resources on page)
    var isAlreadyLoaded = false;
    if (isExisting) {
      if (type === 'script') {
        // For scripts, check readyState or if the script has already executed
        isAlreadyLoaded = element.readyState === 'complete' || element.readyState === 'loaded' ||
                         (element.src && !element.async && !element.defer);
      } else if (type === 'style') {
        // For stylesheets, check if sheet is available
        isAlreadyLoaded = !!element.sheet;
      } else if (type === 'image') {
        // For images, check if complete
        isAlreadyLoaded = element.complete && element.naturalHeight !== 0;
      }
    }

    var resource = {
      url: url,
      type: type,
      element: element,
      startTime: isAlreadyLoaded ? Date.now() - 1 : Date.now(),
      timestamp: new Date().toISOString(),
      status: isAlreadyLoaded ? 'loaded' : 'pending',
      duration: isAlreadyLoaded ? 1 : null,
      error: null,
      clientInfo: getClientInfo()
    };

    resourceStats.resources.push(resource);
    resourceStats.total++;

    if (isAlreadyLoaded) {
      resourceStats.loaded++;
      // Broadcast resource event
      if (resourceCallback) {
        resourceCallback({
          action: 'tracked',
          resource: resource,
          stats: getStats()
        });
      }
      return; // Skip event listeners for already loaded resources
    } else {
      resourceStats.pending++;
      // Broadcast resource event
      if (resourceCallback) {
        resourceCallback({
          action: 'tracked',
          resource: resource,
          stats: getStats()
        });
      }
    }

    // Add load handler
    element.addEventListener('load', function() {
      resource.status = 'loaded';
      resource.duration = Date.now() - resource.startTime;
      resourceStats.loaded++;
      resourceStats.pending--;

      // Broadcast resource loaded event
      if (resourceCallback) {
        resourceCallback({
          action: 'loaded',
          resource: resource,
          stats: getStats()
        });
      }

      // For stylesheets, check if they actually loaded
      if (type === 'style' && element.sheet) {
        try {
          // Try to access cssRules to verify the stylesheet loaded
          var rules = element.sheet.cssRules || element.sheet.rules;
        } catch (e) {
          // CORS or other error accessing stylesheet
          handleResourceError(resource, 'Failed to access stylesheet: ' + e.message);
        }
      }
    });

    // Add error handler
    element.addEventListener('error', function() {
      handleResourceError(resource, 'Failed to load resource');
    });

    // For scripts and styles, also add a timeout check
    if (type === 'script' || type === 'style') {
      setTimeout(function() {
        // Only consider it a timeout if it's still pending AND element is not marked as complete
        if (resource.status === 'pending') {
          // Check if the element is actually in the DOM and attempted to load
          if (document.contains(element)) {
            // Additional check: for scripts, see if they have the 'complete' state
            var isActuallyPending = true;
            if (type === 'script' && element.readyState === 'complete') {
              // Script loaded but event didn't fire (can happen with some TV browsers)
              resource.status = 'loaded';
              resource.duration = Date.now() - resource.startTime;
              resourceStats.loaded++;
              resourceStats.pending--;
              isActuallyPending = false;
            }

            if (isActuallyPending) {
              handleResourceError(resource, 'Resource load timeout (30s)');
            }
          }
        }
      }, 30000);
    }
  }

  /**
   * Handle resource error
   */
  function handleResourceError(resource, message) {
    resource.status = 'failed';
    resource.duration = Date.now() - resource.startTime;
    resource.error = message;
    resourceStats.failed++;
    resourceStats.pending--;

    // Broadcast resource error event
    if (resourceCallback) {
      resourceCallback({
        action: 'failed',
        resource: resource,
        stats: getStats()
      });
    }

    // Report error
    if (errorCallback) {
      errorCallback({
        type: 'resource',
        message: message + ': ' + resource.url,
        url: resource.url,
        resourceType: resource.type,
        duration: resource.duration,
        timestamp: new Date().toISOString()
      });
    }

    // Log to console for debugging
    console.error('[ResourceMonitor] ' + message, {
      url: resource.url,
      type: resource.type,
      duration: resource.duration + 'ms'
    });
  }

  /**
   * Observe DOM for new resources
   */
  function startObserving() {
    if (!window.MutationObserver) {
      console.warn('[ResourceMonitor] MutationObserver not supported');
      return;
    }

    observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return; // Only element nodes

          // Check the node itself
          checkElement(node);

          // Check all descendants
          if (node.querySelectorAll) {
            var scripts = node.querySelectorAll('script[src]');
            var styles = node.querySelectorAll('link[rel="stylesheet"]');
            var images = node.querySelectorAll('img[src]');

            scripts.forEach(function(el) { trackResource(el, 'script'); });
            styles.forEach(function(el) { trackResource(el, 'style'); });
            images.forEach(function(el) { trackResource(el, 'image'); });
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Check if an element is a trackable resource
   */
  function checkElement(element) {
    if (element.tagName === 'SCRIPT' && element.src) {
      trackResource(element, 'script');
    } else if (element.tagName === 'LINK' && element.rel === 'stylesheet' && element.href) {
      trackResource(element, 'style');
    } else if (element.tagName === 'IMG' && element.src) {
      trackResource(element, 'image');
    }
  }

  /**
   * Initialize the resource monitor
   */
  function init(options) {
    options = options || {};
    errorCallback = options.onError || null;
    resourceCallback = options.onResource || null;

    // Track existing resources
    var scripts = document.querySelectorAll('script[src]');
    var styles = document.querySelectorAll('link[rel="stylesheet"]');
    var images = document.querySelectorAll('img[src]');

    scripts.forEach(function(el) { trackResource(el, 'script', true); });
    styles.forEach(function(el) { trackResource(el, 'style', true); });
    images.forEach(function(el) { trackResource(el, 'image', true); });

    // Start observing for new resources
    startObserving();

    // Also track failed fetch/XHR requests
    if (window.fetch) {
      var originalFetch = window.fetch;
      window.fetch = function() {
        var args = Array.prototype.slice.call(arguments);
        var url = args[0];
        var fetchStart = Date.now();

        // Normalize URL for TV browsers
        if (typeof url === 'string' && url.startsWith('/')) {
          url = window.location.protocol + '//' + window.location.host + url;
          args[0] = url;
        }

        return originalFetch.apply(window, args).then(
          function(response) {
            if (!response.ok) {
              // Track failed fetch in resources array
              var fetchResource = {
                url: typeof url === 'string' ? url : (url.url || url),
                type: 'fetch',
                startTime: fetchStart,
                timestamp: new Date().toISOString(),
                status: 'failed',
                duration: Date.now() - fetchStart,
                error: 'HTTP ' + response.status + ' ' + response.statusText,
                httpStatus: response.status,
                clientInfo: getClientInfo()
              };
              resourceStats.resources.push(fetchResource);
              resourceStats.total++;
              resourceStats.failed++;

              if (errorCallback) {
                errorCallback({
                  type: 'network',
                  message: 'Fetch failed: ' + response.status + ' ' + response.statusText,
                  url: typeof url === 'string' ? url : (url.url || url),
                  status: response.status,
                  duration: Date.now() - fetchStart,
                  timestamp: new Date().toISOString(),
                  clientInfo: getClientInfo()
                });
              }
            }
            return response;
          },
          function(error) {
            // Track failed fetch in resources array
            var fetchResource = {
              url: typeof url === 'string' ? url : (url.url || url),
              type: 'fetch',
              startTime: fetchStart,
              timestamp: new Date().toISOString(),
              status: 'failed',
              duration: Date.now() - fetchStart,
              error: 'Network error: ' + error.message,
              clientInfo: getClientInfo()
            };
            resourceStats.resources.push(fetchResource);
            resourceStats.total++;
            resourceStats.failed++;

            if (errorCallback) {
              errorCallback({
                type: 'network',
                message: 'Fetch error: ' + error.message,
                url: typeof url === 'string' ? url : (url.url || url),
                duration: Date.now() - fetchStart,
                timestamp: new Date().toISOString()
              });
            }
            throw error;
          }
        );
      };
    }

    // Track XMLHttpRequest errors
    if (window.XMLHttpRequest) {
      var XHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        var xhr = new XHR();
        var xhrStart;
        var xhrUrl;

        // Override open to capture URL
        var originalOpen = xhr.open;
        xhr.open = function(method, url) {
          // Normalize URL for TV browsers
          if (typeof url === 'string' && url.startsWith('/')) {
            url = window.location.protocol + '//' + window.location.host + url;
          }
          xhrUrl = url;
          return originalOpen.apply(xhr, arguments);
        };

        // Override send to track timing
        var originalSend = xhr.send;
        xhr.send = function() {
          xhrStart = Date.now();

          xhr.addEventListener('load', function() {
            if (xhr.status >= 400) {
              // Track failed XHR in resources array
              var xhrResource = {
                url: xhrUrl,
                type: 'xhr',
                startTime: xhrStart,
                timestamp: new Date().toISOString(),
                status: 'failed',
                duration: Date.now() - xhrStart,
                error: 'HTTP ' + xhr.status + ' ' + xhr.statusText,
                httpStatus: xhr.status,
                clientInfo: getClientInfo()
              };
              resourceStats.resources.push(xhrResource);
              resourceStats.total++;
              resourceStats.failed++;

              if (errorCallback) {
                errorCallback({
                  type: 'network',
                  message: 'XHR failed: ' + xhr.status + ' ' + xhr.statusText,
                  url: xhrUrl,
                  status: xhr.status,
                  duration: Date.now() - xhrStart,
                  timestamp: new Date().toISOString(),
                  clientInfo: getClientInfo()
                });
              }
            }
          });

          xhr.addEventListener('error', function() {
            // Track failed XHR in resources array
            var xhrResource = {
              url: xhrUrl,
              type: 'xhr',
              startTime: xhrStart,
              timestamp: new Date().toISOString(),
              status: 'failed',
              duration: Date.now() - xhrStart,
              error: 'Network error',
              clientInfo: getClientInfo()
            };
            resourceStats.resources.push(xhrResource);
            resourceStats.total++;
            resourceStats.failed++;

            if (errorCallback) {
              errorCallback({
                type: 'network',
                message: 'XHR network error',
                url: xhrUrl,
                duration: Date.now() - xhrStart,
                timestamp: new Date().toISOString(),
                clientInfo: getClientInfo()
              });
            }
          });

          return originalSend.apply(xhr, arguments);
        };

        return xhr;
      };
    }
  }

  /**
   * Get resource statistics
   */
  function getStats() {
    return {
      total: resourceStats.total,
      loaded: resourceStats.loaded,
      failed: resourceStats.failed,
      pending: resourceStats.pending,
      resources: resourceStats.resources.slice(), // Return a copy
      runtime: Date.now() - startTime,
      clientInfo: getClientInfo()
    };
  }

  /**
   * Check if stats have changed significantly
   */
  function hasStatsChanged(oldStats, newStats) {
    if (!oldStats) return true;

    return oldStats.total !== newStats.total ||
           oldStats.loaded !== newStats.loaded ||
           oldStats.failed !== newStats.failed ||
           oldStats.pending !== newStats.pending;
  }

  /**
   * Start periodic stats broadcasting
   */
  function startPeriodicBroadcast(callback, intervalMs) {
    statsCallback = callback;
    intervalMs = intervalMs || 30000; // Default 30 seconds

    if (broadcastInterval) {
      clearInterval(broadcastInterval);
    }

    // Broadcast immediately
    var stats = getStats();
    if (statsCallback) {
      statsCallback(stats);
    }
    lastBroadcastStats = stats;

    // Set up periodic broadcast
    broadcastInterval = setInterval(function() {
      var currentStats = getStats();
      if (hasStatsChanged(lastBroadcastStats, currentStats)) {
        if (statsCallback) {
          statsCallback(currentStats);
        }
        lastBroadcastStats = currentStats;
      }
    }, intervalMs);
  }

  /**
   * Stop periodic broadcasting
   */
  function stopPeriodicBroadcast() {
    if (broadcastInterval) {
      clearInterval(broadcastInterval);
      broadcastInterval = null;
    }
    statsCallback = null;
    lastBroadcastStats = null;
  }

  /**
   * Stop observing
   */
  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    stopPeriodicBroadcast();
  }

  // Track initialization state
  var isInitialized = false;

  // Modified init to track state
  var originalInit = init;
  function initWithState(callback) {
    if (!isInitialized) {
      isInitialized = true;
      return originalInit(callback);
    }
  }

  // Public API
  var api = {
    init: initWithState,
    getStats: getStats,
    stop: stop,
    trackResource: trackResource,
    startPeriodicBroadcast: startPeriodicBroadcast,
    stopPeriodicBroadcast: stopPeriodicBroadcast,
    get isInitialized() { return isInitialized; }
  };

  // Early initialization if flag is set
  if (typeof window !== 'undefined' && window.ResourceMonitorEarlyInit) {
    window.addEventListener('DOMContentLoaded', function() {
      if (!isInitialized) {
        api.init();
      }
    });
  }

  return api;
}));