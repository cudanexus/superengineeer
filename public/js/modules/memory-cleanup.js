/**
 * Memory Cleanup Module
 * Provides utilities for preventing memory leaks in the application
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MemoryCleanup = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Track all registered event listeners for cleanup
  var eventRegistry = new Map();
  var observerRegistry = new Set();
  var intervalRegistry = new Set();
  var timeoutRegistry = new Set();

  /**
   * Enhanced addEventListener that tracks listeners for cleanup
   * @param {Element} element DOM element
   * @param {string} eventType Event type
   * @param {Function} handler Event handler
   * @param {Object} options Event options
   * @returns {Function} Cleanup function
   */
  function addTrackedEventListener(element, eventType, handler, options) {
    if (!element || !eventType || !handler) {
      console.warn('Invalid parameters for addTrackedEventListener');
      return function() {};
    }

    // Create a unique key for this element
    var elementKey = element;
    if (!eventRegistry.has(elementKey)) {
      eventRegistry.set(elementKey, new Map());
    }

    var elementListeners = eventRegistry.get(elementKey);
    if (!elementListeners.has(eventType)) {
      elementListeners.set(eventType, new Set());
    }

    // Store the handler reference
    elementListeners.get(eventType).add({
      handler: handler,
      options: options
    });

    // Add the actual event listener
    element.addEventListener(eventType, handler, options);

    // Return cleanup function
    return function cleanup() {
      element.removeEventListener(eventType, handler, options);

      var listeners = eventRegistry.get(elementKey);
      if (listeners && listeners.has(eventType)) {
        var handlers = listeners.get(eventType);
        handlers.forEach(function(item) {
          if (item.handler === handler) {
            handlers.delete(item);
          }
        });

        if (handlers.size === 0) {
          listeners.delete(eventType);
        }

        if (listeners.size === 0) {
          eventRegistry.delete(elementKey);
        }
      }
    };
  }

  /**
   * Remove all event listeners for an element
   * @param {Element} element DOM element
   * @param {string} eventType Optional specific event type to remove
   */
  function removeAllListeners(element, eventType) {
    if (!element) return;

    var elementListeners = eventRegistry.get(element);
    if (!elementListeners) return;

    if (eventType) {
      // Remove specific event type
      var handlers = elementListeners.get(eventType);
      if (handlers) {
        handlers.forEach(function(item) {
          element.removeEventListener(eventType, item.handler, item.options);
        });
        elementListeners.delete(eventType);
      }
    } else {
      // Remove all event types
      elementListeners.forEach(function(handlers, type) {
        handlers.forEach(function(item) {
          element.removeEventListener(type, item.handler, item.options);
        });
      });
      eventRegistry.delete(element);
    }
  }

  /**
   * Track a MutationObserver for cleanup
   * @param {MutationObserver} observer
   * @returns {Function} Cleanup function
   */
  function trackObserver(observer) {
    observerRegistry.add(observer);

    return function cleanup() {
      observer.disconnect();
      observerRegistry.delete(observer);
    };
  }

  /**
   * Track an interval for cleanup
   * @param {number} intervalId
   * @returns {Function} Cleanup function
   */
  function trackInterval(intervalId) {
    intervalRegistry.add(intervalId);

    return function cleanup() {
      clearInterval(intervalId);
      intervalRegistry.delete(intervalId);
    };
  }

  /**
   * Track a timeout for cleanup
   * @param {number} timeoutId
   * @returns {Function} Cleanup function
   */
  function trackTimeout(timeoutId) {
    timeoutRegistry.add(timeoutId);

    return function cleanup() {
      clearTimeout(timeoutId);
      timeoutRegistry.delete(timeoutId);
    };
  }

  /**
   * Clean up all tracked resources
   */
  function cleanupAll() {
    // Clean up all event listeners
    eventRegistry.forEach(function(elementListeners, element) {
      elementListeners.forEach(function(handlers, eventType) {
        handlers.forEach(function(item) {
          element.removeEventListener(eventType, item.handler, item.options);
        });
      });
    });
    eventRegistry.clear();

    // Disconnect all observers
    observerRegistry.forEach(function(observer) {
      observer.disconnect();
    });
    observerRegistry.clear();

    // Clear all intervals
    intervalRegistry.forEach(function(intervalId) {
      clearInterval(intervalId);
    });
    intervalRegistry.clear();

    // Clear all timeouts
    timeoutRegistry.forEach(function(timeoutId) {
      clearTimeout(timeoutId);
    });
    timeoutRegistry.clear();
  }

  /**
   * Create a cleanup manager for a specific component
   * @param {string} componentName Name of the component
   * @returns {Object} Cleanup manager
   */
  function createCleanupManager(componentName) {
    var cleanupFunctions = [];

    return {
      /**
       * Add a cleanup function
       * @param {Function} cleanupFn
       */
      add: function(cleanupFn) {
        if (typeof cleanupFn === 'function') {
          cleanupFunctions.push(cleanupFn);
        }
      },

      /**
       * Add an event listener with automatic cleanup
       * @param {Element} element
       * @param {string} eventType
       * @param {Function} handler
       * @param {Object} options
       */
      addEventListener: function(element, eventType, handler, options) {
        var cleanup = addTrackedEventListener(element, eventType, handler, options);
        this.add(cleanup);
        return cleanup;
      },

      /**
       * Add an interval with automatic cleanup
       * @param {Function} callback
       * @param {number} delay
       * @returns {number} Interval ID
       */
      setInterval: function(callback, delay) {
        var intervalId = setInterval(callback, delay);
        var cleanup = trackInterval(intervalId);
        this.add(cleanup);
        return intervalId;
      },

      /**
       * Add a timeout with automatic cleanup
       * @param {Function} callback
       * @param {number} delay
       * @returns {number} Timeout ID
       */
      setTimeout: function(callback, delay) {
        var timeoutId = setTimeout(callback, delay);
        var cleanup = trackTimeout(timeoutId);
        this.add(cleanup);
        return timeoutId;
      },

      /**
       * Clean up all resources for this component
       */
      cleanup: function() {
        console.log('Cleaning up component:', componentName);
        cleanupFunctions.forEach(function(fn) {
          try {
            fn();
          } catch (err) {
            console.error('Cleanup error in ' + componentName + ':', err);
          }
        });
        cleanupFunctions = [];
      }
    };
  }

  /**
   * Debounce with cleanup support
   * @param {Function} func Function to debounce
   * @param {number} delay Delay in ms
   * @param {Object} cleanupManager Optional cleanup manager
   * @returns {Function} Debounced function
   */
  function debounceWithCleanup(func, delay, cleanupManager) {
    var timeoutId;

    var debounced = function() {
      var context = this;
      var args = arguments;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(function() {
        func.apply(context, args);
      }, delay);

      if (cleanupManager && !debounced.cleanupAdded) {
        cleanupManager.add(function() {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        });
        debounced.cleanupAdded = true;
      }
    };

    return debounced;
  }

  /**
   * Safely remove DOM element and clean up its listeners
   * @param {Element} element
   */
  function removeElementSafely(element) {
    if (!element) return;

    // Remove all event listeners
    removeAllListeners(element);

    // Recursively clean up child elements
    var children = element.querySelectorAll('*');
    children.forEach(function(child) {
      removeAllListeners(child);
    });

    // Remove from DOM
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  return {
    addTrackedEventListener: addTrackedEventListener,
    removeAllListeners: removeAllListeners,
    trackObserver: trackObserver,
    trackInterval: trackInterval,
    trackTimeout: trackTimeout,
    cleanupAll: cleanupAll,
    createCleanupManager: createCleanupManager,
    debounceWithCleanup: debounceWithCleanup,
    removeElementSafely: removeElementSafely
  };
}));