/**
 * Shell Module
 * Handles terminal/shell tab functionality using xterm.js
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShellModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Dependencies injected via init()
  var state = null;
  var api = null;
  var showToast = null;
  var showErrorToast = null;

  // Module state
  var terminal = null;
  var fitAddon = null;
  var webLinksAddon = null;
  var currentSessionId = null;
  var isInitialized = false;
  var resizeObserver = null;
  var pendingOutput = [];

  function init(deps) {
    state = deps.state;
    api = deps.api;
    showToast = deps.showToast;
    showErrorToast = deps.showErrorToast;
  }

  /**
   * Initialize the terminal when the shell tab is first opened
   */
  function initializeTerminal() {
    if (isInitialized || !window.Terminal) {
      return;
    }

    var container = document.getElementById('shell-terminal');

    if (!container) {
      return;
    }

    // Create terminal instance
    terminal = new window.Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#a855f7',
        cursorAccent: '#1a1a2e',
        selectionBackground: 'rgba(168, 85, 247, 0.3)',
        black: '#1a1a2e',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e0e0e0',
        brightBlack: '#4b5563',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f3f4f6'
      },
      allowTransparency: true,
      scrollback: 10000,
      tabStopWidth: 4
    });

    // Load addons
    if (window.FitAddon) {
      fitAddon = new window.FitAddon.FitAddon();
      terminal.loadAddon(fitAddon);
    }

    if (window.WebLinksAddon) {
      webLinksAddon = new window.WebLinksAddon.WebLinksAddon();
      terminal.loadAddon(webLinksAddon);
    }

    // Open terminal in container
    terminal.open(container);

    // Fit terminal to container
    if (fitAddon) {
      fitAddon.fit();
    }

    // Handle user input - PTY handles echo, just send data directly
    terminal.onData(function(data) {
      if (!currentSessionId) {
        return;
      }

      sendInput(data);
    });

    // Handle resize
    terminal.onResize(function(size) {
      sendResize(size.cols, size.rows);
    });

    // Set up resize observer for container
    setupResizeObserver(container);

    isInitialized = true;

    // Write any pending output
    if (pendingOutput.length > 0) {
      pendingOutput.forEach(function(data) {
        terminal.write(data);
      });
      pendingOutput = [];
    }

    // Show welcome message if no session
    if (!currentSessionId) {
      terminal.writeln('\x1b[90m[Shell not started. Click "Start Shell" or switch projects to begin.]\x1b[0m');
    }
  }

  function setupResizeObserver(container) {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    resizeObserver = new ResizeObserver(function() {
      if (fitAddon && terminal) {
        try {
          fitAddon.fit();
        } catch (e) {
          // Ignore resize errors
        }
      }
    });

    resizeObserver.observe(container);
  }

  /**
   * Start a new shell session for the current project
   */
  function startShell() {
    if (!state.selectedProjectId) {
      showToast('No project selected', 'error');
      return;
    }

    // Stop existing session first
    if (currentSessionId) {
      stopShell();
    }

    api.startShell(state.selectedProjectId)
      .done(function(data) {
        currentSessionId = data.sessionId;

        if (terminal) {
          terminal.clear();
          terminal.focus();

          // Send initial terminal dimensions
          if (fitAddon) {
            fitAddon.fit();
            sendResize(terminal.cols, terminal.rows);
          }
        }

        updateShellButtons(true);
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to start shell');
      });
  }

  /**
   * Stop the current shell session
   */
  function stopShell() {
    if (!state.selectedProjectId || !currentSessionId) {
      return;
    }

    api.stopShell(state.selectedProjectId)
      .done(function() {
        currentSessionId = null;

        if (terminal) {
          terminal.writeln('');
          terminal.writeln('\x1b[90m[Shell stopped]\x1b[0m');
        }

        updateShellButtons(false);
      })
      .fail(function(xhr) {
        showErrorToast(xhr, 'Failed to stop shell');
      });
  }

  /**
   * Send input to the shell
   */
  function sendInput(data) {
    if (!state.selectedProjectId || !currentSessionId) {
      return;
    }

    api.sendShellInput(state.selectedProjectId, data)
      .fail(function() {
        // Shell may have exited
      });
  }

  /**
   * Send resize event to the shell
   */
  function sendResize(cols, rows) {
    if (!state.selectedProjectId || !currentSessionId) {
      return;
    }

    api.resizeShell(state.selectedProjectId, cols, rows)
      .fail(function() {
        // Silently fail - resize not critical
      });
  }

  /**
   * Handle shell output from WebSocket
   */
  function handleShellOutput(data) {
    if (data.sessionId !== currentSessionId) {
      return;
    }

    if (terminal && isInitialized) {
      terminal.write(data.data);
    } else {
      pendingOutput.push(data.data);
    }
  }

  /**
   * Handle shell exit from WebSocket
   */
  function handleShellExit(data) {
    if (data.sessionId !== currentSessionId) {
      return;
    }

    currentSessionId = null;

    if (terminal) {
      terminal.writeln('');
      terminal.writeln('\x1b[90m[Shell exited with code ' + (data.code !== null ? data.code : 'unknown') + ']\x1b[0m');
    }

    updateShellButtons(false);
  }

  /**
   * Handle shell error from WebSocket
   */
  function handleShellError(data) {
    if (data.sessionId !== currentSessionId) {
      return;
    }

    if (terminal) {
      terminal.writeln('\x1b[31m[Error: ' + data.error + ']\x1b[0m');
    }
  }

  /**
   * Update the start/stop button states
   */
  function updateShellButtons(isRunning) {
    var $startBtn = $('#btn-start-shell');
    var $stopBtn = $('#btn-stop-shell');

    if (isRunning) {
      $startBtn.addClass('hidden');
      $stopBtn.removeClass('hidden');
    } else {
      $startBtn.removeClass('hidden');
      $stopBtn.addClass('hidden');
    }
  }

  /**
   * Check shell status for the current project
   */
  function checkShellStatus() {
    if (!state.selectedProjectId || !state.shellEnabled) {
      updateShellButtons(false);
      return;
    }

    api.getShellStatus(state.selectedProjectId)
      .done(function(data) {
        if (data.active) {
          currentSessionId = data.sessionId;
          updateShellButtons(true);
        } else {
          currentSessionId = null;
          updateShellButtons(false);
        }
      })
      .fail(function() {
        currentSessionId = null;
        updateShellButtons(false);
      });
  }

  /**
   * Called when switching to the shell tab
   */
  function onTabActivated() {
    initializeTerminal();

    if (fitAddon && terminal) {
      // Small delay to ensure container is visible
      setTimeout(function() {
        fitAddon.fit();
        terminal.focus();
      }, 50);
    }

    checkShellStatus();
  }

  /**
   * Called when project changes
   */
  function onProjectChanged() {
    currentSessionId = null;

    if (terminal) {
      terminal.clear();
      terminal.writeln('\x1b[90m[Project changed. Click "Start Shell" to begin.]\x1b[0m');
    }

    updateShellButtons(false);
    checkShellStatus();
  }

  /**
   * Clean up terminal resources
   */
  function dispose() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (terminal) {
      terminal.dispose();
      terminal = null;
    }

    fitAddon = null;
    webLinksAddon = null;
    isInitialized = false;
    currentSessionId = null;
    pendingOutput = [];
  }

  /**
   * Setup event handlers for shell buttons
   */
  function setupHandlers() {
    $('#btn-start-shell').on('click', function() {
      startShell();
    });

    $('#btn-stop-shell').on('click', function() {
      stopShell();
    });
  }

  return {
    init: init,
    setupHandlers: setupHandlers,
    onTabActivated: onTabActivated,
    onProjectChanged: onProjectChanged,
    handleShellOutput: handleShellOutput,
    handleShellExit: handleShellExit,
    handleShellError: handleShellError,
    startShell: startShell,
    stopShell: stopShell,
    checkShellStatus: checkShellStatus,
    dispose: dispose
  };
}));
