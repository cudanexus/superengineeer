import { Request, Response, NextFunction } from 'express';
import { validateProjectExists } from '../../../src/middleware/project';
import { NotFoundError, ValidationError } from '../../../src/utils';
import { ProjectRepository } from '../../../src/repositories';
import { ProjectDiscoveryService } from '../../../src/services/project-discovery';

describe('Project Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let mockProjectRepository: jest.Mocked<ProjectRepository>;
  let mockProjectDiscoveryService: jest.Mocked<ProjectDiscoveryService>;

  beforeEach(() => {
    req = {
      params: {},
    };
    res = {};
    next = jest.fn();

    mockProjectRepository = {
      findById: jest.fn(),
    } as any;

    mockProjectDiscoveryService = {
      autoRegisterProject: jest.fn(),
      scanForProjects: jest.fn(),
    };
  });

  describe('validateProjectExists', () => {
    const mockProject = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test Project',
      path: '/test/path',
      status: 'stopped' as const,
      currentConversationId: null,
      nextItem: null,
      currentItem: null,
      lastContextUsage: null,
      permissionOverrides: null,
      modelOverride: null,
      mcpOverrides: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('should attach project to request when found', async () => {
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      mockProjectRepository.findById.mockResolvedValue(mockProject);

      const middleware = validateProjectExists(mockProjectRepository);
      await middleware(req as Request, res as Response, next);

      expect(mockProjectRepository.findById).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
      expect(req.project).toEqual(mockProject);
      expect(next).toHaveBeenCalledWith();
    });

    it('should throw NotFoundError when project not found', async () => {
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      mockProjectRepository.findById.mockResolvedValue(null);

      const middleware = validateProjectExists(mockProjectRepository);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('Project not found');
    });

    it('should throw NotFoundError when id is missing', async () => {
      req.params = {};

      const middleware = validateProjectExists(mockProjectRepository);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('Project ID is required');
    });

    it('should handle repository errors', async () => {
      req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const repoError = new Error('Database connection failed');
      mockProjectRepository.findById.mockRejectedValue(repoError);

      const middleware = validateProjectExists(mockProjectRepository);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(repoError);
    });

    describe('with ProjectDiscoveryService', () => {
      it('should auto-register project when not found but discovery service finds it', async () => {
        req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
        mockProjectRepository.findById.mockResolvedValueOnce(null); // First call returns null
        mockProjectDiscoveryService.autoRegisterProject.mockResolvedValue(mockProject);
        mockProjectRepository.findById.mockResolvedValueOnce(mockProject); // Second call returns the registered project

        const middleware = validateProjectExists(mockProjectRepository, mockProjectDiscoveryService);
        await middleware(req as Request, res as Response, next);

        expect(mockProjectRepository.findById).toHaveBeenCalledTimes(2);
        expect(mockProjectDiscoveryService.autoRegisterProject).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
        expect(req.project).toEqual(mockProject);
        expect(next).toHaveBeenCalledWith();
      });

      it('should throw NotFoundError when project not found and auto-registration fails', async () => {
        req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
        mockProjectRepository.findById.mockResolvedValue(null);
        mockProjectDiscoveryService.autoRegisterProject.mockResolvedValue(null);

        const middleware = validateProjectExists(mockProjectRepository, mockProjectDiscoveryService);
        await middleware(req as Request, res as Response, next);

        expect(mockProjectRepository.findById).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
        expect(mockProjectDiscoveryService.autoRegisterProject).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
        expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
      });

      it('should work normally when discovery service is not provided', async () => {
        req.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
        mockProjectRepository.findById.mockResolvedValue(null);

        // Don't pass discovery service - mimics old behavior
        const middleware = validateProjectExists(mockProjectRepository);
        await middleware(req as Request, res as Response, next);

        expect(mockProjectRepository.findById).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
        expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
      });
    });
  });
});