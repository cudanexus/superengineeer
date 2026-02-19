/**
 * Login Page JavaScript
 * Handles form submission and auto-fill from QR code URL params
 */
(function() {
  'use strict';

  var $form = $('#login-form');
  var $username = $('#username');
  var $password = $('#password');
  var $errorMessage = $('#error-message');
  var $errorText = $('#error-text');
  var $loginBtn = $('#login-btn');
  var $btnText = $('#btn-text');
  var $btnSpinner = $('#btn-spinner');

  /**
   * Show error message
   */
  function showError(message) {
    $errorText.text(message);
    $errorMessage.removeClass('hidden');
  }

  /**
   * Hide error message
   */
  function hideError() {
    $errorMessage.addClass('hidden');
  }

  /**
   * Set loading state on button
   */
  function setLoading(loading) {
    $loginBtn.prop('disabled', loading);

    if (loading) {
      $btnText.text('Logging in...');
      $btnSpinner.removeClass('hidden');
    } else {
      $btnText.text('Login');
      $btnSpinner.addClass('hidden');
    }
  }

  /**
   * Submit login credentials
   */
  function submitLogin(username, password) {
    hideError();
    setLoading(true);

    $.ajax({
      url: '/api/auth/login',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ username: username, password: password })
    })
    .done(function() {
      // Clear URL params (from QR code) and redirect to main app
      window.location.href = '/';
    })
    .fail(function(xhr) {
      setLoading(false);
      var message = 'Login failed';

      if (xhr.responseJSON && xhr.responseJSON.error) {
        message = xhr.responseJSON.error;
      }

      showError(message);

      // Focus password field for retry
      $password.val('').focus();
    });
  }

  /**
   * Initialize - check for URL params from QR code
   */
  function init() {
    var params = new URLSearchParams(window.location.search);
    var username = params.get('u');
    var password = params.get('p');

    // Auto-fill from URL params
    if (username) {
      $username.val(decodeURIComponent(username));
    }

    if (password) {
      $password.val(decodeURIComponent(password));
    }

    // Auto-submit if both credentials provided (QR code scan)
    if (username && password) {
      submitLogin(
        decodeURIComponent(username),
        decodeURIComponent(password)
      );
    } else {
      // Focus appropriate field
      if (username) {
        $password.focus();
      } else {
        $username.focus();
      }
    }
  }

  // Form submit handler
  $form.on('submit', function(e) {
    e.preventDefault();

    var username = $username.val().trim();
    var password = $password.val();

    if (!username || !password) {
      showError('Please enter both username and password');
      return;
    }

    submitLogin(username, password);
  });

  // Clear error on input
  $username.add($password).on('input', function() {
    hideError();
  });

  // Initialize
  init();
})();
