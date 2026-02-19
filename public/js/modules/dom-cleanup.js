/**
 * DOM Cleanup Module
 * Utilities for cleaning up dynamic DOM elements and preventing memory leaks
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DOMCleanup = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var observers = new Set();
  var virtualElements = new WeakMap();

  /**
   * Create a mutation observer that tracks DOM changes for cleanup
   * @param {Element} target Target element to observe
   * @param {Object} config MutationObserver config
   * @param {Function} callback Callback function
   * @returns {MutationObserver}
   */
  function createTrackedObserver(target, config, callback) {
    var observer = new MutationObserver(function(mutations) {
      // Track added nodes for potential cleanup
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              trackElement(node);
            }
          });

          mutation.removedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              cleanupElement(node);
            }
          });
        }
      });

      // Call original callback
      if (callback) {
        callback(mutations);
      }
    });

    observer.observe(target, config);
    observers.add(observer);

    return observer;
  }

  /**
   * Track an element for cleanup
   * @param {Element} element
   */
  function trackElement(element) {
    if (!element || virtualElements.has(element)) return;

    var elementData = {
      eventListeners: [],
      childObservers: [],
      timers: [],
      animationFrames: []
    };

    virtualElements.set(element, elementData);

    // Track child elements recursively
    var children = element.querySelectorAll('*');
    for (var i = 0; i < children.length; i++) {
      trackElement(children[i]);
    }
  }

  /**
   * Clean up an element and its children
   * @param {Element} element
   */
  function cleanupElement(element) {
    if (!element) return;

    // Clean up this element's data
    var elementData = virtualElements.get(element);
    if (elementData) {
      // Remove event listeners
      elementData.eventListeners.forEach(function(listener) {
        element.removeEventListener(listener.type, listener.handler, listener.options);
      });

      // Disconnect observers
      elementData.childObservers.forEach(function(observer) {
        observer.disconnect();
      });

      // Clear timers
      elementData.timers.forEach(function(timerId) {
        clearTimeout(timerId);
        clearInterval(timerId);
      });

      // Cancel animation frames
      elementData.animationFrames.forEach(function(frameId) {
        cancelAnimationFrame(frameId);
      });

      virtualElements.delete(element);
    }

    // Clean up children recursively
    var children = element.querySelectorAll('*');
    for (var i = 0; i < children.length; i++) {
      cleanupElement(children[i]);
    }

    // Clean up any jQuery data
    if (window.jQuery) {
      jQuery(element).off();
      jQuery(element).removeData();
    }

    // Clear element references
    element.innerHTML = '';
  }

  /**
   * Enhanced addEventListener that tracks for cleanup
   * @param {Element} element
   * @param {string} type
   * @param {Function} handler
   * @param {Object} options
   */
  function addManagedEventListener(element, type, handler, options) {
    if (!element) return;

    // Track the element if not already tracked
    trackElement(element);

    var elementData = virtualElements.get(element);
    if (elementData) {
      elementData.eventListeners.push({
        type: type,
        handler: handler,
        options: options
      });
    }

    element.addEventListener(type, handler, options);
  }

  /**
   * Enhanced setTimeout that tracks for cleanup
   * @param {Element} element Element associated with the timer
   * @param {Function} callback
   * @param {number} delay
   * @returns {number} Timer ID
   */
  function addManagedTimeout(element, callback, delay) {
    var timerId = setTimeout(callback, delay);

    if (element) {
      trackElement(element);
      var elementData = virtualElements.get(element);
      if (elementData) {
        elementData.timers.push(timerId);
      }
    }

    return timerId;
  }

  /**
   * Enhanced setInterval that tracks for cleanup
   * @param {Element} element Element associated with the timer
   * @param {Function} callback
   * @param {number} delay
   * @returns {number} Timer ID
   */
  function addManagedInterval(element, callback, delay) {
    var timerId = setInterval(callback, delay);

    if (element) {
      trackElement(element);
      var elementData = virtualElements.get(element);
      if (elementData) {
        elementData.timers.push(timerId);
      }
    }

    return timerId;
  }

  /**
   * Enhanced requestAnimationFrame that tracks for cleanup
   * @param {Element} element Element associated with the animation
   * @param {Function} callback
   * @returns {number} Frame ID
   */
  function addManagedAnimationFrame(element, callback) {
    var frameId = requestAnimationFrame(callback);

    if (element) {
      trackElement(element);
      var elementData = virtualElements.get(element);
      if (elementData) {
        elementData.animationFrames.push(frameId);
      }
    }

    return frameId;
  }

  /**
   * Clean up all jQuery event handlers and data
   * @param {Element} container Container element
   */
  function cleanupJQuery(container) {
    if (!window.jQuery) return;

    var $ = window.jQuery;

    // Find all elements with jQuery data
    $(container).find('*').addBack().each(function() {
      var $elem = $(this);

      // Remove all event handlers
      $elem.off();

      // Remove all data
      $elem.removeData();

      // Remove from jQuery cache
      if ($.cache) {
        var elemData = $._data(this);
        if (elemData && elemData.events) {
          for (var type in elemData.events) {
            $elem.off(type);
          }
        }
      }
    });
  }

  /**
   * Clean up before removing a large DOM tree
   * @param {Element} container
   */
  function prepareForRemoval(container) {
    if (!container) return;

    // Stop any playing media
    var mediaElements = container.querySelectorAll('video, audio');
    mediaElements.forEach(function(media) {
      media.pause();
      media.src = '';
      media.load();
    });

    // Clear any iframes
    var iframes = container.querySelectorAll('iframe');
    iframes.forEach(function(iframe) {
      iframe.src = 'about:blank';
    });

    // Cancel any ongoing animations
    var animatedElements = container.querySelectorAll('[style*="animation"], [style*="transition"]');
    animatedElements.forEach(function(elem) {
      elem.style.animation = 'none';
      elem.style.transition = 'none';
    });

    // Clean up any canvas contexts
    var canvases = container.querySelectorAll('canvas');
    canvases.forEach(function(canvas) {
      var ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // Clean up jQuery
    cleanupJQuery(container);

    // Clean up tracked elements
    cleanupElement(container);
  }

  /**
   * Safely replace innerHTML with cleanup
   * @param {Element} element
   * @param {string} html
   */
  function safeInnerHTML(element, html) {
    if (!element) return;

    // Clean up existing content
    prepareForRemoval(element);

    // Set new content
    element.innerHTML = html;
  }

  /**
   * Safely empty an element
   * @param {Element} element
   */
  function safeEmpty(element) {
    if (!element) return;

    // Clean up existing content
    prepareForRemoval(element);

    // Clear content
    element.innerHTML = '';
  }

  /**
   * Create a self-cleaning element
   * @param {string} tagName
   * @param {Object} options
   * @returns {Element}
   */
  function createManagedElement(tagName, options) {
    var element = document.createElement(tagName);

    options = options || {};

    if (options.className) {
      element.className = options.className;
    }

    if (options.innerHTML) {
      element.innerHTML = options.innerHTML;
    }

    if (options.parent) {
      options.parent.appendChild(element);
    }

    // Track this element
    trackElement(element);

    // Add self-destruct method
    element.cleanup = function() {
      prepareForRemoval(this);
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };

    return element;
  }

  /**
   * Clean up all tracked observers
   */
  function disconnectAllObservers() {
    observers.forEach(function(observer) {
      observer.disconnect();
    });
    observers.clear();
  }

  /**
   * Get cleanup statistics
   * @returns {Object}
   */
  function getStats() {
    var trackedElements = 0;
    var totalListeners = 0;
    var totalTimers = 0;

    virtualElements.forEach(function(data) {
      trackedElements++;
      totalListeners += data.eventListeners.length;
      totalTimers += data.timers.length;
    });

    return {
      trackedElements: trackedElements,
      totalListeners: totalListeners,
      totalTimers: totalTimers,
      observers: observers.size
    };
  }

  /**
   * Batch DOM operations for better performance
   * @param {Function} operations Function containing DOM operations
   */
  function batchOperations(operations) {
    // Use requestAnimationFrame to batch DOM changes
    requestAnimationFrame(function() {
      // Use DocumentFragment for multiple insertions
      var fragment = document.createDocumentFragment();

      // Provide fragment to operations
      operations(fragment);

      // Trigger single reflow/repaint
      if (fragment.childNodes.length > 0 && fragment.parentNode) {
        fragment.parentNode.appendChild(fragment);
      }
    });
  }

  return {
    createTrackedObserver: createTrackedObserver,
    trackElement: trackElement,
    cleanupElement: cleanupElement,
    addManagedEventListener: addManagedEventListener,
    addManagedTimeout: addManagedTimeout,
    addManagedInterval: addManagedInterval,
    addManagedAnimationFrame: addManagedAnimationFrame,
    prepareForRemoval: prepareForRemoval,
    safeInnerHTML: safeInnerHTML,
    safeEmpty: safeEmpty,
    createManagedElement: createManagedElement,
    disconnectAllObservers: disconnectAllObservers,
    getStats: getStats,
    batchOperations: batchOperations
  };
}));