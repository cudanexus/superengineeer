import fs from 'fs';
import path from 'path';

export interface PermissionRule {
  tool: string;
  specifier?: string;
}

export interface ClaudePermissions {
  /** @deprecated Use allowRules instead. Will be removed in future version. */
  dangerouslySkipPermissions: boolean;
  /** @deprecated Use allowRules instead */
  allowedTools: string[];
  /** Permission rules that allow tool usage without prompting */
  allowRules: string[];
  /** Permission rules that require confirmation before use */
  askRules: string[];
  /** Permission rules that block tool usage entirely */
  denyRules: string[];
  /** Default permission mode: 'acceptEdits' | 'plan' */
  defaultMode: 'acceptEdits' | 'plan';
}

export const DEFAULT_AGENT_PROMPT_TEMPLATE = `You are working on the project "\${var:project-name}".

Current Phase: \${var:phase-title}
Current Milestone: \${var:milestone-title}

Your current task is:
\${var:milestone-item}

Instructions:
1. Work on this specific task until it is fully complete
2. Write tests for the functionality and ensure they pass
3. If you discover important context about the project, save it to CLAUDE.md
4. Mark the task as completed in ROADMAP.md by changing [ ] to [x]
5. Do NOT work on other tasks - focus only on this one

When finished, you MUST return a JSON object with the following structure:
{
  "status": "COMPLETE" or "FAILED",
  "reason": "explanation of what was done or why it failed"
}`;

export interface GlobalSettings {
  maxConcurrentAgents: number;
  claudePermissions: ClaudePermissions;
  agentPromptTemplate: string;
  sendWithCtrlEnter: boolean;
  historyLimit: number;
  enableDesktopNotifications: boolean;
  appendSystemPrompt: string;
  claudeMdMaxSizeKB: number;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  maxConcurrentAgents: 3,
  claudePermissions: {
    dangerouslySkipPermissions: false,
    allowedTools: [],
    allowRules: [],
    askRules: [],
    denyRules: [],
    defaultMode: 'acceptEdits',
  },
  agentPromptTemplate: DEFAULT_AGENT_PROMPT_TEMPLATE,
  sendWithCtrlEnter: true,
  historyLimit: 25,
  enableDesktopNotifications: false,
  appendSystemPrompt: '* ALWAYS use tasks instead of todos',
  claudeMdMaxSizeKB: 50,
};

// Update type that allows partial claudePermissions for incremental updates
export interface SettingsUpdate {
  maxConcurrentAgents?: number;
  claudePermissions?: Partial<ClaudePermissions>;
  agentPromptTemplate?: string;
  sendWithCtrlEnter?: boolean;
  historyLimit?: number;
  enableDesktopNotifications?: boolean;
  appendSystemPrompt?: string;
  claudeMdMaxSizeKB?: number;
}

export interface SettingsRepository {
  get(): Promise<GlobalSettings>;
  update(settings: SettingsUpdate): Promise<GlobalSettings>;
}

export interface FileSystemAdapter {
  readFileSync(filePath: string, encoding: BufferEncoding): string;
  writeFileSync(filePath: string, data: string): void;
  existsSync(filePath: string): boolean;
  mkdirSync(dirPath: string, options: { recursive: boolean }): void;
}

const defaultFileSystem: FileSystemAdapter = {
  readFileSync: (filePath, encoding) => fs.readFileSync(filePath, encoding),
  writeFileSync: (filePath, data) => fs.writeFileSync(filePath, data),
  existsSync: (filePath) => fs.existsSync(filePath),
  mkdirSync: (dirPath, options) => fs.mkdirSync(dirPath, options),
};

export class FileSettingsRepository implements SettingsRepository {
  private settings: GlobalSettings;
  private readonly filePath: string;
  private readonly fileSystem: FileSystemAdapter;

  constructor(dataDir: string, fileSystem: FileSystemAdapter = defaultFileSystem) {
    this.fileSystem = fileSystem;
    this.ensureDataDir(dataDir);
    this.filePath = path.join(dataDir, 'settings.json');
    this.settings = this.loadFromFile();
  }

  private ensureDataDir(dataDir: string): void {
    if (!this.fileSystem.existsSync(dataDir)) {
      this.fileSystem.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadFromFile(): GlobalSettings {
    if (!this.fileSystem.existsSync(this.filePath)) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const data = this.fileSystem.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as Partial<GlobalSettings>;
      return this.mergeWithDefaults(parsed);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private mergeWithDefaults(parsed: Partial<GlobalSettings>): GlobalSettings {
    const parsedPerms = parsed.claudePermissions;

    return {
      maxConcurrentAgents: parsed.maxConcurrentAgents ?? DEFAULT_SETTINGS.maxConcurrentAgents,
      claudePermissions: {
        dangerouslySkipPermissions: parsedPerms?.dangerouslySkipPermissions ?? DEFAULT_SETTINGS.claudePermissions.dangerouslySkipPermissions,
        allowedTools: parsedPerms?.allowedTools ?? DEFAULT_SETTINGS.claudePermissions.allowedTools,
        allowRules: parsedPerms?.allowRules ?? DEFAULT_SETTINGS.claudePermissions.allowRules,
        askRules: parsedPerms?.askRules ?? DEFAULT_SETTINGS.claudePermissions.askRules,
        denyRules: parsedPerms?.denyRules ?? DEFAULT_SETTINGS.claudePermissions.denyRules,
        defaultMode: parsedPerms?.defaultMode ?? DEFAULT_SETTINGS.claudePermissions.defaultMode,
      },
      agentPromptTemplate: parsed.agentPromptTemplate ?? DEFAULT_SETTINGS.agentPromptTemplate,
      sendWithCtrlEnter: parsed.sendWithCtrlEnter ?? DEFAULT_SETTINGS.sendWithCtrlEnter,
      historyLimit: parsed.historyLimit ?? DEFAULT_SETTINGS.historyLimit,
      enableDesktopNotifications: parsed.enableDesktopNotifications ?? DEFAULT_SETTINGS.enableDesktopNotifications,
      appendSystemPrompt: parsed.appendSystemPrompt ?? DEFAULT_SETTINGS.appendSystemPrompt,
      claudeMdMaxSizeKB: parsed.claudeMdMaxSizeKB ?? DEFAULT_SETTINGS.claudeMdMaxSizeKB,
    };
  }

  private saveToFile(): void {
    const data = JSON.stringify(this.settings, null, 2);
    this.fileSystem.writeFileSync(this.filePath, data);
  }

  get(): Promise<GlobalSettings> {
    return Promise.resolve({ ...this.settings });
  }

  update(updates: SettingsUpdate): Promise<GlobalSettings> {
    if (updates.maxConcurrentAgents !== undefined) {
      this.settings.maxConcurrentAgents = Math.max(1, updates.maxConcurrentAgents);
    }

    if (updates.claudePermissions) {
      this.settings.claudePermissions = {
        ...this.settings.claudePermissions,
        ...updates.claudePermissions,
      };
    }

    if (updates.agentPromptTemplate !== undefined) {
      this.settings.agentPromptTemplate = updates.agentPromptTemplate;
    }

    if (updates.sendWithCtrlEnter !== undefined) {
      this.settings.sendWithCtrlEnter = updates.sendWithCtrlEnter;
    }

    if (updates.historyLimit !== undefined) {
      this.settings.historyLimit = Math.max(5, Math.min(100, updates.historyLimit));
    }

    if (updates.enableDesktopNotifications !== undefined) {
      this.settings.enableDesktopNotifications = updates.enableDesktopNotifications;
    }

    if (updates.appendSystemPrompt !== undefined) {
      this.settings.appendSystemPrompt = updates.appendSystemPrompt;
    }

    if (updates.claudeMdMaxSizeKB !== undefined) {
      this.settings.claudeMdMaxSizeKB = Math.max(10, Math.min(500, updates.claudeMdMaxSizeKB));
    }

    this.saveToFile();
    return Promise.resolve({ ...this.settings });
  }
}
