import { SessionManager } from '../../../src/agents/session-manager';
import {
  createMockProjectRepository,
  createMockConversationRepository,
  sampleProject,
} from '../helpers/mock-factories';

jest.mock('../../../src/utils/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../../../src/utils/uuid', () => ({
  isValidUUID: jest.fn().mockImplementation((id: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }),
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockProjectRepo: ReturnType<typeof createMockProjectRepository>;
  let mockConversationRepo: ReturnType<typeof createMockConversationRepository>;
  const projectId = sampleProject.id;
  const validUUID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectRepo = createMockProjectRepository([{ ...sampleProject }]);
    mockConversationRepo = createMockConversationRepository();
    sessionManager = new SessionManager(mockProjectRepo, mockConversationRepo);
  });

  describe('validateSession', () => {
    it('should return false for invalid UUID', async () => {
      const result = await sessionManager.validateSession(projectId, 'not-a-uuid');

      expect(result).toBe(false);
    });

    it('should return true when conversation exists', async () => {
      mockConversationRepo.findById.mockResolvedValue({
        id: validUUID,
        projectId,
        itemRef: null,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await sessionManager.validateSession(projectId, validUUID);

      expect(result).toBe(true);
    });

    it('should return false when conversation does not exist', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      const result = await sessionManager.validateSession(projectId, validUUID);

      expect(result).toBe(false);
    });

    it('should return false when findById throws', async () => {
      mockConversationRepo.findById.mockRejectedValue(new Error('DB error'));

      const result = await sessionManager.validateSession(projectId, validUUID);

      expect(result).toBe(false);
    });
  });

  describe('recoverSession', () => {
    it('should return existing session when valid', async () => {
      mockConversationRepo.findById.mockResolvedValue({
        id: validUUID,
        projectId,
        itemRef: null,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await sessionManager.recoverSession(projectId, validUUID);

      expect(result.isNewSession).toBe(false);
      expect(result.conversationId).toBe(validUUID);
    });

    it('should create new session when invalid', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      const result = await sessionManager.recoverSession(projectId, validUUID);

      expect(result.isNewSession).toBe(true);
      expect(result.recoveryReason).toBe('Session not found');
    });
  });

  describe('createNewSession', () => {
    it('should create conversation and set as current', async () => {
      const result = await sessionManager.createNewSession(projectId);

      expect(result.isNewSession).toBe(true);
      expect(mockConversationRepo.create).toHaveBeenCalledWith(projectId, null);
      expect(mockProjectRepo.setCurrentConversation).toHaveBeenCalledWith(
        projectId,
        result.conversationId
      );
    });
  });

  describe('getOrCreateSession', () => {
    it('should throw when project not found', async () => {
      await expect(
        sessionManager.getOrCreateSession('non-existent')
      ).rejects.toThrow('Project not found');
    });

    it('should return existing session when requestedSessionId is valid', async () => {
      mockConversationRepo.findById.mockResolvedValue({
        id: validUUID,
        projectId,
        itemRef: null,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await sessionManager.getOrCreateSession(projectId, validUUID);

      expect(result.isNewSession).toBe(false);
      expect(result.sessionId).toBe(validUUID);
    });

    it('should recover when requested session is invalid UUID', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      const result = await sessionManager.getOrCreateSession(projectId, 'bad-uuid');

      expect(result.isNewSession).toBe(true);
    });

    it('should handle delete error for invalid UUID gracefully', async () => {
      mockConversationRepo.deleteConversation.mockRejectedValue(new Error('Delete failed'));
      mockConversationRepo.findById.mockResolvedValue(null);

      const result = await sessionManager.getOrCreateSession(projectId, 'bad-uuid');

      expect(result.isNewSession).toBe(true);
    });

    it('should create new session when requested session not found', async () => {
      mockConversationRepo.findById.mockResolvedValue(null);

      const result = await sessionManager.getOrCreateSession(projectId, validUUID);

      expect(result.isNewSession).toBe(true);
    });

    it('should warn when session belongs to different project', async () => {
      mockConversationRepo.findById.mockResolvedValue({
        id: validUUID,
        projectId: 'other-project',
        itemRef: null,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await sessionManager.getOrCreateSession(projectId, validUUID);

      // Should fall through to create new since projectId doesn't match
      expect(result.isNewSession).toBe(true);
    });

    it('should create new session when explicitly requested', async () => {
      const result = await sessionManager.getOrCreateSession(
        projectId,
        undefined,
        true
      );

      expect(result.isNewSession).toBe(true);
    });

    it('should use current conversation when available and valid', async () => {
      mockProjectRepo.findById.mockResolvedValue({
        ...sampleProject,
        currentConversationId: validUUID,
      });
      mockConversationRepo.findById.mockResolvedValue({
        id: validUUID,
        projectId,
        itemRef: null,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await sessionManager.getOrCreateSession(projectId);

      expect(result.isNewSession).toBe(false);
      expect(result.conversationId).toBe(validUUID);
    });

    it('should recover when current conversation is invalid', async () => {
      mockProjectRepo.findById.mockResolvedValue({
        ...sampleProject,
        currentConversationId: validUUID,
      });
      mockConversationRepo.findById.mockResolvedValue(null);

      const result = await sessionManager.getOrCreateSession(projectId);

      expect(result.isNewSession).toBe(true);
      expect(result.recoveryReason).toBe('Session not found');
    });

    it('should create new session when no current conversation', async () => {
      mockProjectRepo.findById.mockResolvedValue({
        ...sampleProject,
        currentConversationId: null,
      });

      const result = await sessionManager.getOrCreateSession(projectId);

      expect(result.isNewSession).toBe(true);
    });
  });

  describe('handleSessionNotFound', () => {
    it('should delete old conversation and create new session', async () => {
      const result = await sessionManager.handleSessionNotFound(projectId, validUUID);

      expect(result.isNewSession).toBe(true);
      expect(mockConversationRepo.deleteConversation).toHaveBeenCalledWith(projectId, validUUID);
    });

    it('should handle delete error gracefully', async () => {
      mockConversationRepo.deleteConversation.mockRejectedValue(new Error('Not found'));

      const result = await sessionManager.handleSessionNotFound(projectId, validUUID);

      expect(result.isNewSession).toBe(true);
    });
  });

  describe('saveContextUsage', () => {
    it('should save context usage to metadata', async () => {
      const contextUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        maxContextTokens: 200000,
        percentUsed: 0.075,
      };

      await sessionManager.saveContextUsage(projectId, validUUID, contextUsage);

      expect(mockConversationRepo.updateMetadata).toHaveBeenCalledWith(
        projectId,
        validUUID,
        { contextUsage }
      );
    });

    it('should handle save error gracefully', async () => {
      mockConversationRepo.updateMetadata.mockRejectedValue(new Error('Save failed'));

      // Should not throw
      await sessionManager.saveContextUsage(projectId, validUUID, {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        maxContextTokens: 200000,
        percentUsed: 0.075,
      });
    });
  });

  describe('event listeners', () => {
    it('should register and fire event listeners', async () => {
      const listener = jest.fn();
      sessionManager.on('sessionRecovery', listener);

      // Trigger session recovery
      mockConversationRepo.findById.mockResolvedValue(null);
      await sessionManager.recoverSession(projectId, validUUID);

      expect(listener).toHaveBeenCalledWith(
        projectId,
        validUUID,
        expect.any(String),
        'Session not found'
      );
    });

    it('should unregister event listeners', async () => {
      const listener = jest.fn();
      sessionManager.on('sessionRecovery', listener);
      sessionManager.off('sessionRecovery', listener);

      mockConversationRepo.findById.mockResolvedValue(null);
      await sessionManager.recoverSession(projectId, validUUID);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      const badListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      sessionManager.on('sessionRecovery', badListener);

      mockConversationRepo.findById.mockResolvedValue(null);

      // Should not throw despite listener error
      await sessionManager.recoverSession(projectId, validUUID);

      expect(badListener).toHaveBeenCalled();
    });

    it('should handle off for non-existent event', () => {
      const listener = jest.fn();
      // Should not throw
      sessionManager.off('sessionRecovery', listener);
    });
  });
});
