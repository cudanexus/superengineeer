import fs from 'fs';
import path from 'path';
import { AgentMessage, ContextUsage } from '../agents';
import { MilestoneItemRef } from './project';

export interface ConversationMetadata {
  contextUsage?: ContextUsage;
}

export interface Conversation {
  id: string;
  projectId: string;
  itemRef: MilestoneItemRef | null;
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
  label?: string;
  metadata?: ConversationMetadata;
}

export interface ConversationRepository {
  create(projectId: string, itemRef: MilestoneItemRef | null): Promise<Conversation>;
  findById(projectId: string, conversationId: string): Promise<Conversation | null>;
  getByProject(projectId: string, limit?: number): Promise<Conversation[]>;
  addMessage(projectId: string, conversationId: string, message: AgentMessage): Promise<void>;
  getMessages(projectId: string, conversationId: string, limit?: number): Promise<AgentMessage[]>;
  clearMessages(projectId: string, conversationId: string): Promise<void>;
  renameConversation(projectId: string, conversationId: string, label: string): Promise<void>;
  updateMetadata(
    projectId: string,
    conversationId: string,
    metadata: Partial<ConversationMetadata>
  ): Promise<void>;
  // Legacy methods for backward compatibility
  addMessageLegacy(projectId: string, message: AgentMessage): Promise<void>;
  getMessagesLegacy(projectId: string, limit?: number): Promise<AgentMessage[]>;
}

export interface ConversationFileSystem {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, data: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  mkdir(dirPath: string): Promise<void>;
  readdir(dirPath: string): Promise<string[]>;
}

const defaultFileSystem: ConversationFileSystem = {
  readFile: (filePath) => fs.promises.readFile(filePath, 'utf-8'),
  writeFile: (filePath, data) => fs.promises.writeFile(filePath, data, 'utf-8'),
  exists: async (filePath) => {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: async (dirPath) => {
    await fs.promises.mkdir(dirPath, { recursive: true });
  },
  readdir: async (dirPath) => {
    try {
      return await fs.promises.readdir(dirPath);
    } catch {
      return [];
    }
  },
};

export interface ProjectPathResolver {
  getProjectPath(projectId: string): string | null;
}

export interface FileConversationRepositoryConfig {
  projectPathResolver: ProjectPathResolver;
  fileSystem?: ConversationFileSystem;
  maxMessagesPerConversation?: number;
}

export function generateConversationId(
  projectId: string,
  itemRef: MilestoneItemRef | null
): string {
  const timestamp = Date.now();

  if (!itemRef) {
    return `${projectId}_general_${timestamp}`;
  }

  return `${projectId}_${itemRef.milestoneId}_item${itemRef.itemIndex}_${timestamp}`;
}

export class FileConversationRepository implements ConversationRepository {
  private readonly projectPathResolver: ProjectPathResolver;
  private readonly fileSystem: ConversationFileSystem;
  private readonly maxMessages: number;
  private readonly cache: Map<string, Conversation> = new Map();

  constructor(config: FileConversationRepositoryConfig) {
    this.projectPathResolver = config.projectPathResolver;
    this.fileSystem = config.fileSystem || defaultFileSystem;
    this.maxMessages = config.maxMessagesPerConversation || 1000;
  }

  // Conversations are now stored in {project-root}/.claudito/conversations/
  private getProjectDataDir(projectId: string): string | null {
    const projectPath = this.projectPathResolver.getProjectPath(projectId);

    if (!projectPath) {
      return null;
    }

    return path.join(projectPath, '.claudito');
  }

  private getConversationsDir(projectId: string): string | null {
    const dataDir = this.getProjectDataDir(projectId);

    if (!dataDir) {
      return null;
    }

    return path.join(dataDir, 'conversations');
  }

  private getConversationPath(projectId: string, conversationId: string): string | null {
    const conversationsDir = this.getConversationsDir(projectId);

    if (!conversationsDir) {
      return null;
    }

    return path.join(conversationsDir, `${conversationId}.json`);
  }

  private getCacheKey(projectId: string, conversationId: string): string {
    return `${projectId}:${conversationId}`;
  }

  async create(projectId: string, itemRef: MilestoneItemRef | null): Promise<Conversation> {
    const id = generateConversationId(projectId, itemRef);
    const now = new Date().toISOString();

    const conversation: Conversation = {
      id,
      projectId,
      itemRef,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.saveConversation(projectId, conversation);
    return conversation;
  }

  async findById(projectId: string, conversationId: string): Promise<Conversation | null> {
    return this.loadConversation(projectId, conversationId);
  }

  async getByProject(projectId: string, limit?: number): Promise<Conversation[]> {
    const conversationsDir = this.getConversationsDir(projectId);

    if (!conversationsDir) {
      return [];
    }

    const exists = await this.fileSystem.exists(conversationsDir);

    if (!exists) {
      return [];
    }

    const files = await this.fileSystem.readdir(conversationsDir);
    const conversations: Conversation[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const conversationId = file.replace('.json', '');
      const conversation = await this.loadConversation(projectId, conversationId);

      if (conversation) {
        conversations.push(conversation);
      }
    }

    const sorted = conversations.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (limit && limit > 0) {
      return sorted.slice(0, limit);
    }

    return sorted;
  }

  async renameConversation(
    projectId: string,
    conversationId: string,
    label: string
  ): Promise<void> {
    const conversation = await this.loadConversation(projectId, conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.label = label;
    conversation.updatedAt = new Date().toISOString();
    await this.saveConversation(projectId, conversation);
  }

  async addMessage(
    projectId: string,
    conversationId: string,
    message: AgentMessage
  ): Promise<void> {
    const conversation = await this.loadConversation(projectId, conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push(message);

    if (conversation.messages.length > this.maxMessages) {
      conversation.messages.splice(0, conversation.messages.length - this.maxMessages);
    }

    conversation.updatedAt = new Date().toISOString();
    await this.saveConversation(projectId, conversation);
  }

  async getMessages(
    projectId: string,
    conversationId: string,
    limit?: number
  ): Promise<AgentMessage[]> {
    const conversation = await this.loadConversation(projectId, conversationId);

    if (!conversation) {
      return [];
    }

    const messages = conversation.messages;

    if (limit && limit < messages.length) {
      return messages.slice(-limit);
    }

    return messages;
  }

  async clearMessages(projectId: string, conversationId: string): Promise<void> {
    const conversation = await this.loadConversation(projectId, conversationId);

    if (!conversation) {
      return;
    }

    conversation.messages = [];
    conversation.updatedAt = new Date().toISOString();
    await this.saveConversation(projectId, conversation);
  }

  async updateMetadata(
    projectId: string,
    conversationId: string,
    metadata: Partial<ConversationMetadata>
  ): Promise<void> {
    const conversation = await this.loadConversation(projectId, conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.metadata = {
      ...conversation.metadata,
      ...metadata,
    };
    conversation.updatedAt = new Date().toISOString();
    await this.saveConversation(projectId, conversation);
  }

  // Legacy methods - operate on a "current" or default conversation
  // These maintain backward compatibility with existing code
  async addMessageLegacy(projectId: string, message: AgentMessage): Promise<void> {
    const conversations = await this.getByProject(projectId);
    let currentConversation = conversations[0];

    if (!currentConversation) {
      currentConversation = await this.create(projectId, null);
    }

    await this.addMessage(projectId, currentConversation.id, message);
  }

  async getMessagesLegacy(projectId: string, limit?: number): Promise<AgentMessage[]> {
    const conversations = await this.getByProject(projectId);
    const mostRecent = conversations[0];

    if (!mostRecent) {
      return [];
    }

    return this.getMessages(projectId, mostRecent.id, limit);
  }

  private async loadConversation(
    projectId: string,
    conversationId: string
  ): Promise<Conversation | null> {
    const cacheKey = this.getCacheKey(projectId, conversationId);

    if (this.cache.has(cacheKey)) {
      return { ...this.cache.get(cacheKey)! };
    }

    const filePath = this.getConversationPath(projectId, conversationId);

    if (!filePath) {
      return null;
    }

    const exists = await this.fileSystem.exists(filePath);

    if (!exists) {
      return null;
    }

    try {
      const content = await this.fileSystem.readFile(filePath);
      const conversation = JSON.parse(content) as Conversation;
      this.cache.set(cacheKey, conversation);
      return { ...conversation };
    } catch {
      return null;
    }
  }

  private async saveConversation(projectId: string, conversation: Conversation): Promise<void> {
    const conversationsDir = this.getConversationsDir(projectId);

    if (!conversationsDir) {
      throw new Error(`Project ${projectId} not found`);
    }

    const exists = await this.fileSystem.exists(conversationsDir);

    if (!exists) {
      await this.fileSystem.mkdir(conversationsDir);
    }

    const cacheKey = this.getCacheKey(projectId, conversation.id);
    this.cache.set(cacheKey, { ...conversation });

    const filePath = this.getConversationPath(projectId, conversation.id);

    if (!filePath) {
      throw new Error(`Project ${projectId} not found`);
    }

    await this.fileSystem.writeFile(filePath, JSON.stringify(conversation, null, 2));
  }
}
