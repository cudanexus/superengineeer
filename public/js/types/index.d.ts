/**
 * Global Type Definitions for Claudito Frontend
 *
 * This file contains the core types used throughout the Claudito application.
 * All modules can reference these types via the Claudito namespace.
 */

/// <reference types="jquery" />

declare namespace Claudito {
  /**
   * Core application state managed by state-module.js
   */
  interface ApplicationState {
    // ============================================================
    // Project Management
    // ============================================================
    projects: API.Project[];
    selectedProjectId: string | null;
    projectSearchQuery: string;

    // ============================================================
    // Conversations
    // ============================================================
    conversations: Record<string, API.Conversation>;
    currentConversationId: string | null;
    currentConversationStats: ConversationStats | null;
    currentConversationMetadata: ConversationMetadata | null;
    conversationHistoryOpen: boolean;
    historyLimit: number;
    pendingRenameConversationId: string | null;

    // ============================================================
    // WebSocket Connection
    // ============================================================
    websocket: WebSocket | null;
    wsReconnect: {
      attempts: number;
      maxAttempts: number;
      baseDelay: number;
      maxDelay: number;
      timeout: number | null;
    };

    // ============================================================
    // Agent State
    // ============================================================
    agentMode: 'interactive' | 'roadmap' | 'ralphLoop';
    permissionMode: 'acceptEdits' | 'plan';
    pendingPermissionMode: string | null;
    currentAgentMode: string | null;
    agentStarting: boolean;
    messageSending: boolean;
    agentStatusInterval: number | null;
    agentOutputScrollLock: boolean;
    queuedMessageCount: number;
    currentSessionId: string | null;
    currentPlanFile: string | null;
    isModeSwitching: boolean;
    waitingVersion: number;
    activePromptType: 'question' | 'permission' | 'plan_mode' | null;
    pendingMessageBeforeQuestion: string | null;
    justAnsweredQuestion: boolean;

    // ============================================================
    // UI State
    // ============================================================
    activeTab: 'agent-output' | 'project-files' | 'roadmap' | 'ralph-loop' | 'git' | 'shell';
    fontSize: number;
    sendWithCtrlEnter: boolean;
    debugPanelOpen: boolean;
    debugRefreshInterval: number | null;
    debugExpandedLogs: Record<string, boolean>;
    debugLogFilters: {
      error: boolean;
      warn: boolean;
      info: boolean;
      debug: boolean;
      frontend: boolean;
    };

    // ============================================================
    // File Browser State
    // ============================================================
    fileBrowser: {
      expandedDirs: Record<string, boolean>;
      selectedFile: string | null;
      rootEntries: FileEntry[];
    };
    openFiles: OpenFile[];
    activeFilePath: string | null;
    contextMenuTarget: {
      path: string;
      isDir: boolean;
      name: string;
    } | null;

    // ============================================================
    // Folder Browser State
    // ============================================================
    folderBrowser: {
      currentPath: string | null;
    };

    // ============================================================
    // Roadmap State
    // ============================================================
    roadmapGenerating: boolean;
    currentRoadmap: API.Roadmap | null;
    pendingDeleteTask: {
      phaseId: string;
      milestoneId: string;
      taskIndex: number;
    } | null;
    pendingDeleteMilestone: {
      phaseId: string;
      milestoneId: string;
    } | null;
    pendingDeletePhase: {
      phaseId: string;
    } | null;

    // ============================================================
    // Ralph Loop State
    // ============================================================
    currentRalphLoopId: string | null;
    isRalphLoopRunning: boolean;

    // ============================================================
    // Git State
    // ============================================================
    git: {
      expandedDirs: Record<string, boolean>;
      selectedFile: string | null;
    };
    gitContextTarget: {
      path: string;
      type: string;
      status: string;
    } | null;
    isGitOperating: boolean;

    // ============================================================
    // Shell State
    // ============================================================
    shellEnabled: boolean;

    // ============================================================
    // Search State
    // ============================================================
    search: {
      isOpen: boolean;
      query: string;
      matches: HTMLElement[];
      currentIndex: number;
      filters: {
        user: boolean;
        assistant: boolean;
        tool: boolean;
        system: boolean;
      };
      searchHistory: boolean;
      historyResults: SearchResult[];
      options: {
        regex: boolean;
        caseSensitive: boolean;
      };
    };

    // ============================================================
    // Resource Management
    // ============================================================
    resourceStatus: {
      runningCount: number;
      maxConcurrent: number;
      queuedCount: number;
      queuedProjects: string[];
    };

    // ============================================================
    // Pending Operations
    // ============================================================
    pendingDeleteId: string | null;
    pendingDeleteFile: {
      path: string;
      isDirectory: boolean;
      name: string;
    } | null;
    pendingCreateFile: {
      parentPath: string;
    } | null;
    pendingCreateFolder: {
      parentPath: string;
    } | null;
    pendingImages: AttachedImage[];

    // ============================================================
    // Claude Files State
    // ============================================================
    claudeFilesState: {
      files: ClaudeFile[];
      currentFile: {
        path: string;
        name: string;
        content: string;
        originalContent: string;
        size: number;
        isGlobal: boolean;
      } | null;
    };

    // ============================================================
    // Task Management
    // ============================================================
    currentTodos: TodoItem[];

    // ============================================================
    // Other State
    // ============================================================
    devMode: boolean;
    projectInputs: Record<string, string>;
  }

  /**
   * Common dependency injection interface for all modules
   */
  interface ModuleDependencies {
    // Core dependencies
    state: ApplicationState;
    api: typeof import('../modules/api-client');

    // UI utilities
    escapeHtml: (text: string) => string;
    showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    showConfirm: (title: string, message: string, options?: ConfirmOptions) => Promise<boolean>;
    openModal: (modalId: string) => void;
    closeModal: (modalId: string) => void;
    closeAllModals: () => void;

    // Data utilities
    findProjectById: (id: string) => API.Project | undefined;
    LocalStorage: typeof import('../modules/local-storage');

    // Module references (optional - not all modules need all of these)
    DiffEngine?: typeof import('../modules/diff-engine');
    ToolRenderer?: typeof import('../modules/tool-renderer');
    MessageRenderer?: typeof import('../modules/message-renderer');
    Formatters?: typeof import('../modules/formatters');
    Validators?: typeof import('../modules/validators');

    // Additional utilities (module-specific)
    scrollConversationToBottom?: () => void;
    updateTreeSelection?: () => void;
    sendInteractiveMessage?: (message: string, images?: AttachedImage[]) => void;
    loadConversation?: (conversationId?: string, beforeMessageIndex?: number) => void;
    truncateString?: (str: string, maxLength: number) => string;
    highlightCode?: (code: string, language: string) => string;
    getLanguageFromPath?: (filePath: string) => string | null;
    formatBytes?: (bytes: number) => string;
    formatTime?: (timestamp: string | Date) => string;
    formatLogTime?: (timestamp: string) => string;
    marked?: any; // Markdown parser library
  }

  /**
   * Common interfaces used across modules
   */

  interface ConversationStats {
    messageCount: number;
    toolCallCount: number;
    userMessageCount: number;
    durationMs: number;
    startedAt: string;
    lastMessageAt?: string;
    totalTokens?: number;
  }

  interface ConversationMetadata {
    contextUsage?: API.ContextUsage;
  }

  interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isEditable?: boolean;
    children?: FileEntry[];
  }

  interface OpenFile {
    path: string;
    name: string;
    content: string;
    originalContent: string;
    modified: boolean;
    isMarkdown?: boolean;
    previewMode?: boolean;
  }

  interface ClaudeFile {
    path: string;
    name: string;
    exists: boolean;
    size?: number;
    content?: string;
    isGlobal?: boolean;
  }

  interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
  }

  interface AttachedImage {
    id: string;
    dataUrl: string;
    mimeType: string;
    size: number;
  }

  interface SearchResult {
    conversationId: string;
    messageIndex: number;
    content: string;
    role: string;
    timestamp: string;
  }

  interface ConfirmOptions {
    danger?: boolean;
    confirmText?: string;
    cancelText?: string;
  }

  /**
   * jQuery extensions used in the application
   */
  interface JQuery {
    modal(action?: 'show' | 'hide' | 'toggle'): JQuery;
  }
}