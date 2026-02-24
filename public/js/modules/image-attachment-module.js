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
  var MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
  var MAX_IMAGE_PAYLOAD_BYTES = 900 * 1024;
  var MAX_IMAGE_DIMENSION = 1568;
  var TARGET_IMAGE_PAYLOAD_BYTES = 700 * 1024;

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
    // Limit original file size to 5MB before processing
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast('Image too large (max 5MB)', 'error');
      return;
    }

    optimizeImage(file, function(result) {
      if (!result || !result.dataUrl) {
        showToast('Failed to process image', 'error');
        return;
      }

      if (result.size > MAX_IMAGE_PAYLOAD_BYTES) {
        showToast('Image is still too large after compression. Try a smaller screenshot.', 'error');
        return;
      }

      var imageId = 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      state.pendingImages.push({
        id: imageId,
        dataUrl: result.dataUrl,
        mimeType: result.mimeType,
        size: result.size
      });
      renderPreviews();
    }, function() {
      showToast('Failed to read image', 'error');
    });
  }

  function estimateDataUrlSize(dataUrl) {
    var payload = (dataUrl || '').split(',')[1] || '';
    return Math.floor((payload.length * 3) / 4);
  }

  function loadImageFromDataUrl(dataUrl, onSuccess, onError) {
    var img = new Image();
    img.onload = function() {
      onSuccess(img);
    };
    img.onerror = onError;
    img.src = dataUrl;
  }

  function drawToCanvas(img, width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  }

  function optimizeImage(file, onSuccess, onError) {
    var reader = new FileReader();

    reader.onload = function(e) {
      var originalDataUrl = e.target.result;
      loadImageFromDataUrl(originalDataUrl, function(img) {
        var width = img.width || 1;
        var height = img.height || 1;
        var scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
        var targetWidth = Math.max(1, Math.floor(width * scale));
        var targetHeight = Math.max(1, Math.floor(height * scale));
        var canvas = drawToCanvas(img, targetWidth, targetHeight);

        if (!canvas) {
          onError();
          return;
        }

        var workingType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        var bestDataUrl = canvas.toDataURL(workingType, 0.9);
        var bestSize = estimateDataUrlSize(bestDataUrl);

        if (bestSize > TARGET_IMAGE_PAYLOAD_BYTES || workingType !== 'image/jpeg') {
          // JPEG is much smaller for screenshots/photos and avoids prompt overflow.
          var quality = 0.88;
          bestDataUrl = canvas.toDataURL('image/jpeg', quality);
          bestSize = estimateDataUrlSize(bestDataUrl);

          while (bestSize > TARGET_IMAGE_PAYLOAD_BYTES && quality > 0.5) {
            quality -= 0.08;
            bestDataUrl = canvas.toDataURL('image/jpeg', quality);
            bestSize = estimateDataUrlSize(bestDataUrl);
          }
        }

        while (bestSize > TARGET_IMAGE_PAYLOAD_BYTES && targetWidth > 640 && targetHeight > 640) {
          targetWidth = Math.max(640, Math.floor(targetWidth * 0.85));
          targetHeight = Math.max(640, Math.floor(targetHeight * 0.85));
          canvas = drawToCanvas(img, targetWidth, targetHeight);
          if (!canvas) {
            break;
          }
          bestDataUrl = canvas.toDataURL('image/jpeg', 0.72);
          bestSize = estimateDataUrlSize(bestDataUrl);
        }

        onSuccess({
          dataUrl: bestDataUrl,
          mimeType: bestDataUrl.indexOf('data:image/jpeg') === 0 ? 'image/jpeg' : file.type,
          size: bestSize
        });
      }, onError);
    };

    reader.onerror = onError;
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
      '<span>Waiting for AI response...</span>' +
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
