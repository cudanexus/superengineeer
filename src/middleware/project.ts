import { Request, Response, NextFunction } from 'express';
import { NotFoundError, ValidationError } from '../utils';
import { ProjectRepository, ProjectStatus } from '../repositories';
import { ProjectDiscoveryService } from '../services/project-discovery';

/**
 * Middleware to validate project exists and attach it to the request
 * Now includes auto-registration capability for projects not in registry
 */
export function validateProjectExists(
  projectRepository: ProjectRepository,
  projectDiscoveryService?: ProjectDiscoveryService
): (req: Request & { project?: ProjectStatus }, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request & { project?: ProjectStatus }, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      if (!id) {
        throw new ValidationError('Project ID is required');
      }

      let project = await projectRepository.findById(id);

      // If project not found in registry and discovery service is available, try to auto-register it
      if (!project && projectDiscoveryService) {
        const autoRegistered = await projectDiscoveryService.autoRegisterProject(id);
        if (autoRegistered) {
          // Fetch the full project status after registration
          project = await projectRepository.findById(id);
        }
      }

      if (!project) {
        throw new NotFoundError('Project');
      }

      // Attach project to request for downstream handlers
      req.project = project;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Type augmentation for Express Request to include project
 */
declare module 'express-serve-static-core' {
  interface Request {
    project?: ProjectStatus;
  }
}