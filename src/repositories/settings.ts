import fs from 'fs';
import path from 'path';

export interface ClaudePermissions {
  dangerouslySkipPermissions: boolean;
  allowedTools: string[];
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
}

const DEFAULT_SETTINGS: GlobalSettings = {
  maxConcurrentAgents: 3,
  claudePermissions: {
    dangerouslySkipPermissions: true,
    allowedTools: [],
  },
  agentPromptTemplate: DEFAULT_AGENT_PROMPT_TEMPLATE,
  sendWithCtrlEnter: true,
  historyLimit: 25,
};

export interface SettingsRepository {
  get(): Promise<GlobalSettings>;
  update(settings: Partial<GlobalSettings>): Promise<GlobalSettings>;
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
    return {
      maxConcurrentAgents: parsed.maxConcurrentAgents ?? DEFAULT_SETTINGS.maxConcurrentAgents,
      claudePermissions: {
        ...DEFAULT_SETTINGS.claudePermissions,
        ...parsed.claudePermissions,
      },
      agentPromptTemplate: parsed.agentPromptTemplate ?? DEFAULT_SETTINGS.agentPromptTemplate,
      sendWithCtrlEnter: parsed.sendWithCtrlEnter ?? DEFAULT_SETTINGS.sendWithCtrlEnter,
      historyLimit: parsed.historyLimit ?? DEFAULT_SETTINGS.historyLimit,
    };
  }

  private saveToFile(): void {
    const data = JSON.stringify(this.settings, null, 2);
    this.fileSystem.writeFileSync(this.filePath, data);
  }

  get(): Promise<GlobalSettings> {
    return Promise.resolve({ ...this.settings });
  }

  update(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
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

    this.saveToFile();
    return Promise.resolve({ ...this.settings });
  }
}
