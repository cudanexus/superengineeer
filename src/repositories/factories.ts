/**
 * Repository factory implementations
 */

import {
  IRepositoryFactory,
  IProjectRepository,
  IConversationRepository,
  ISettingsRepository,
  IRalphLoopRepository,
  ProjectPathResolver
} from './interfaces';

import { FileProjectRepository } from './project';
import { FileConversationRepository } from './conversation';
import { FileSettingsRepository } from './settings';
import { FileRalphLoopRepository } from './ralph-loop';
import { getDataDirectory } from '../utils';

/**
 * Default repository factory using file system
 */
export class FileRepositoryFactory implements IRepositoryFactory {
  constructor(
    private readonly projectPathResolver: ProjectPathResolver
  ) {}

  createProjectRepository(): IProjectRepository {
    // Cast is safe as FileProjectRepository implements ProjectRepository
    // which extends IProjectRepository
    const dataDir = getDataDirectory();
    return new FileProjectRepository(dataDir) as unknown as IProjectRepository;
  }

  createConversationRepository(): IConversationRepository {
    // Cast is safe as FileConversationRepository implements ConversationRepository
    // which extends IConversationRepository
    return new FileConversationRepository({
      projectPathResolver: this.projectPathResolver
    }) as unknown as IConversationRepository;
  }

  createSettingsRepository(): ISettingsRepository {
    // Cast is safe as FileSettingsRepository implements SettingsRepository
    // which extends ISettingsRepository
    const dataDir = getDataDirectory();
    return new FileSettingsRepository(dataDir) as unknown as ISettingsRepository;
  }

  createRalphLoopRepository(): IRalphLoopRepository {
    // Cast is safe as FileRalphLoopRepository implements RalphLoopRepository
    // which extends IRalphLoopRepository
    return new FileRalphLoopRepository({
      projectPathResolver: this.projectPathResolver
    }) as unknown as IRalphLoopRepository;
  }
}

/**
 * In-memory repository factory for testing
 */
export class InMemoryRepositoryFactory implements IRepositoryFactory {
  private projectRepo?: IProjectRepository;
  private conversationRepo?: IConversationRepository;
  private settingsRepo?: ISettingsRepository;
  private ralphLoopRepo?: IRalphLoopRepository;

  constructor(
    private readonly mocks?: {
      projectRepository?: IProjectRepository;
      conversationRepository?: IConversationRepository;
      settingsRepository?: ISettingsRepository;
      ralphLoopRepository?: IRalphLoopRepository;
    }
  ) {}

  createProjectRepository(): IProjectRepository {
    if (this.mocks?.projectRepository) {
      return this.mocks.projectRepository;
    }
    if (!this.projectRepo) {
      throw new Error('In-memory project repository not implemented');
    }
    return this.projectRepo;
  }

  createConversationRepository(): IConversationRepository {
    if (this.mocks?.conversationRepository) {
      return this.mocks.conversationRepository;
    }
    if (!this.conversationRepo) {
      throw new Error('In-memory conversation repository not implemented');
    }
    return this.conversationRepo;
  }

  createSettingsRepository(): ISettingsRepository {
    if (this.mocks?.settingsRepository) {
      return this.mocks.settingsRepository;
    }
    if (!this.settingsRepo) {
      throw new Error('In-memory settings repository not implemented');
    }
    return this.settingsRepo;
  }

  createRalphLoopRepository(): IRalphLoopRepository {
    if (this.mocks?.ralphLoopRepository) {
      return this.mocks.ralphLoopRepository;
    }
    if (!this.ralphLoopRepo) {
      throw new Error('In-memory ralph loop repository not implemented');
    }
    return this.ralphLoopRepo;
  }
}

/**
 * Create a mock repository factory for testing
 */
export function createMockRepositoryFactory(
  overrides?: Partial<IRepositoryFactory>
): IRepositoryFactory {
  return {
    createProjectRepository: jest.fn().mockReturnValue({
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateStatus: jest.fn(),
      updateConversation: jest.fn(),
      updateNextItem: jest.fn(),
      updateCurrentItem: jest.fn(),
      updateContextUsage: jest.fn(),
      updatePermissionOverrides: jest.fn(),
      updateModelOverride: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
      deleteAll: jest.fn(),
      setCurrentConversation: jest.fn(),
      getByPath: jest.fn().mockResolvedValue(null)
    }),
    createConversationRepository: jest.fn().mockReturnValue({
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      getByProject: jest.fn().mockResolvedValue([]),
      addMessage: jest.fn(),
      getMessages: jest.fn().mockResolvedValue([]),
      clearMessages: jest.fn(),
      deleteConversation: jest.fn(),
      renameConversation: jest.fn(),
      updateMetadata: jest.fn(),
      searchMessages: jest.fn().mockResolvedValue([]),
      flush: jest.fn(),
      addMessageLegacy: jest.fn(),
      getMessagesLegacy: jest.fn().mockResolvedValue([])
    }),
    createSettingsRepository: jest.fn().mockReturnValue({
      get: jest.fn(),
      update: jest.fn()
    }),
    createRalphLoopRepository: jest.fn().mockReturnValue({
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      findByProject: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      addSummary: jest.fn(),
      addFeedback: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
      deleteAll: jest.fn(),
      flush: jest.fn()
    }),
    ...overrides
  };
}