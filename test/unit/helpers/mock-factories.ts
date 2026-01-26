import { FilesystemService, DriveInfo, DirectoryEntry } from '../../../src/routes/filesystem';
import { SettingsRepository, GlobalSettings, SettingsUpdate } from '../../../src/repositories';

// Default settings for testing
export const DEFAULT_TEST_SETTINGS: GlobalSettings = {
  maxConcurrentAgents: 3,
  claudePermissions: {
    dangerouslySkipPermissions: false,
    allowedTools: [],
    defaultMode: 'acceptEdits',
    allowRules: [],
    denyRules: [],
    askRules: [],
  },
  agentPromptTemplate: 'Default template',
  sendWithCtrlEnter: true,
  historyLimit: 25,
  enableDesktopNotifications: true,
  appendSystemPrompt: '',
  claudeMdMaxSizeKB: 100,
};

export function createMockFilesystemService(): jest.Mocked<FilesystemService> {
  return {
    listDrives: jest.fn(),
    listDirectory: jest.fn(),
    listDirectoryWithFiles: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    createDirectory: jest.fn(),
    deleteFile: jest.fn(),
    deleteDirectory: jest.fn(),
    isTextFile: jest.fn(),
  };
}

export function createMockSettingsRepository(
  initialSettings?: Partial<GlobalSettings>
): jest.Mocked<SettingsRepository> {
  let settings: GlobalSettings = { ...DEFAULT_TEST_SETTINGS, ...initialSettings };

  return {
    get: jest.fn().mockImplementation(() => Promise.resolve({ ...settings })),
    update: jest.fn().mockImplementation((updates: SettingsUpdate) => {
      // Handle claudePermissions separately to maintain type safety
      const { claudePermissions: updatedPermissions, ...otherUpdates } = updates;

      settings = {
        ...settings,
        ...otherUpdates,
      } as GlobalSettings;

      if (updatedPermissions) {
        settings.claudePermissions = {
          ...settings.claudePermissions,
          ...updatedPermissions,
        };
      }

      return Promise.resolve({ ...settings });
    }),
  };
}

// Sample test data
export const sampleDrives: DriveInfo[] = [
  { name: 'C:', path: 'C:\\' },
  { name: 'D:', path: 'D:\\' },
];

export const sampleDirectoryEntries: DirectoryEntry[] = [
  { name: 'src', path: '/project/src', isDirectory: true },
  { name: 'test', path: '/project/test', isDirectory: true },
  { name: 'package.json', path: '/project/package.json', isDirectory: false },
  { name: 'README.md', path: '/project/README.md', isDirectory: false },
];

export const sampleFileContent = 'export const hello = "world";';
