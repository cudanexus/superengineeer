/**
 * Image Attachment Module
 * Handles image paste, preview, and modal display functionality
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ImageAttachmentModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies (injected via init)
  var state;
  var showToast;
  var scrollConversationToBottom;

  /**
   * Initialize the module with dependencies
   * @param {Object} deps - Dependencies object
   */
  function init(deps) {
    state = deps.state;
    showToast = deps.showToast;
    scrollConversationToBottom = deps.scrollConversationToBottom;
  }

  /**
   * Handle paste event for images
   * @param {Event} e - Paste event
   */
  function handlePaste(e) {
    var clipboardData = e.originalEvent.clipboardData || e.clipboardData;

    if (!clipboardData || !clipboardData.items) return;

    for (var i = 0; i < clipboardData.items.length; i++) {
      var item = clipboardData.items[i];

      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        var file = item.getAsFile();

        if (file) {
          processFile(file);
        }
      }
    }
  }

  /**
   * Process an image file for attachment
   * @param {File} file - Image file to process
   */
  function processFile(file) {
    // Limit file size to 5MB
    var maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      showToast('Image too large (max 5MB)', 'error');
      return;
    }

    var reader = new FileReader();

    reader.onload = function(e) {
      var dataUrl = e.target.result;
      var imageId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      state.pendingImages.push({
        id: imageId,
        dataUrl: dataUrl,
        mimeType: file.type,
        size: file.size
      });

      renderPreviews();
    };

    reader.onerror = function() {
      showToast('Failed to read image', 'error');
    };

    reader.readAsDataURL(file);
  }

  /**
   * Render image preview thumbnails
   */
  function renderPreviews() {
    var $container = $('#image-preview-container');
    var $previews = $('#image-previews');

    if (state.pendingImages.length === 0) {
      $container.addClass('hidden');
      $previews.empty();
      return;
    }

    $container.removeClass('hidden');
    $previews.empty();

    state.pendingImages.forEach(function(img) {
      var sizeKB = Math.round(img.size / 1024);
      var sizeText = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB';

      var html = '<div class="image-preview-item" data-image-id="' + img.id + '">' +
        '<img src="' + img.dataUrl + '" alt="Preview">' +
        '<button type="button" class="image-preview-remove" data-image-id="' + img.id + '">' +
          '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>' +
          '</svg>' +
        '</button>' +
        '<div class="image-preview-size">' + sizeText + '</div>' +
      '</div>';
      $previews.append(html);
    });
  }

  /**
   * Remove a single image by ID
   * @param {string} imageId - ID of image to remove
   */
  function removeImage(imageId) {
    state.pendingImages = state.pendingImages.filter(function(img) {
      return img.id !== imageId;
    });
    renderPreviews();
  }

  /**
   * Clear all pending images
   */
  function clearAll() {
    state.pendingImages = [];
    renderPreviews();
  }

  /**
   * Show waiting indicator in conversation
   */
  function showWaitingIndicator() {
    removeWaitingIndicator(); // Remove any existing one first
    var html = '<div id="waiting-indicator" class="flex items-center gap-2 text-gray-400 text-sm py-2">' +
      '<div class="loading-spinner small"></div>' +
      '<span>Waiting for Claude response...</span>' +
    '</div>';
    $('#conversation').append(html);
    scrollConversationToBottom();
  }

  /**
   * Remove waiting indicator from conversation
   */
  function removeWaitingIndicator() {
    $('#waiting-indicator').remove();
  }

  /**
   * Show full-size image in modal
   * @param {string} src - Image source URL
   */
  function showModal(src) {
    var $modal = $('#image-modal');

    if ($modal.length === 0) {
      // Create modal if it doesn't exist
      $('body').append(
        '<div id="image-modal" class="hidden">' +
          '<img src="" alt="Full size image">' +
        '</div>'
      );
      $modal = $('#image-modal');

      // Close on click
      $modal.on('click', function() {
        $modal.addClass('hidden');
      });

      // Close on escape
      $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && !$modal.hasClass('hidden')) {
          $modal.addClass('hidden');
        }
      });
    }

    $modal.find('img').attr('src', src);
    $modal.removeClass('hidden');
  }

  /**
   * Setup event handlers for image functionality
   */
  function setupHandlers() {
    // Handle paste in message input
    $('#input-message').on('paste', handlePaste);

    // Handle file input change (drag & drop or file picker)
    $(document).on('change', '#image-input', function() {
      var files = this.files;

      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image') !== -1) {
          processFile(files[i]);
        }
      }

      // Reset input
      this.value = '';
    });

    // Handle remove button click on image previews
    $(document).on('click', '.image-preview-remove', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var imageId = $(this).data('image-id');
      removeImage(imageId);
    });

    // Expose showModal globally for inline onclick handlers
    window.showImageModal = showModal;
  }

  // Public API
  return {
    init: init,
    handlePaste: handlePaste,
    processFile: processFile,
    renderPreviews: renderPreviews,
    removeImage: removeImage,
    clearAll: clearAll,
    showWaitingIndicator: showWaitingIndicator,
    removeWaitingIndicator: removeWaitingIndicator,
    showModal: showModal,
    setupHandlers: setupHandlers
  };
}));
