import { Request, Response, NextFunction } from 'express';
import { ProjectRepository } from '../repositories';
import { ShellService } from '../services';
import { NotFoundError, ValidationError, asyncHandler } from '../utils/errors';

// Extend Express Request type to include project
declare module 'express' {
  interface Request {
    project?: {
      id: string;
      name: string;
      path: string;
    };
  }
}

export interface ProjectValidatorDeps {
  projectRepository: ProjectRepository;
}

/**
 * Middleware that validates the project ID parameter and attaches
 * the project to the request object for downstream use.
 *
 * This prevents duplicated project lookup and validation logic
 * across multiple route handlers.
 */
export function createProjectValidator(deps: ProjectValidatorDeps) {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const projectId = req.params['id'];

    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const project = await deps.projectRepository.findById(projectId);

    if (!project) {
      throw new NotFoundError('Project');
    }

    // Attach to request for downstream use
    req.project = project;
    next();
  });
}

/**
 * Middleware that validates shell service availability.
 * This prevents duplicated shell service validation logic.
 */
export function createShellServiceValidator(
  shellService: ShellService | null,
  shellEnabled: boolean,
  shellDisabledMessage = 'Terminal is disabled when binding to all network interfaces (0.0.0.0) for security. Bind to localhost to enable.'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!shellEnabled) {
      res.status(403).json({
        error: shellDisabledMessage,
        shellDisabled: true
      });
      return;
    }

    if (!shellService) {
      res.status(503).json({
        error: 'Shell service not available'
      });
      return;
    }

    next();
  };
}

/**
 * Middleware that validates Ralph Loop service availability.
 */
export function createRalphLoopValidator(ralphLoopService: unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!ralphLoopService) {
      res.status(503).json({
        error: 'Ralph Loop service not available'
      });
      return;
    }

    next();
  };
}

/**
 * Composite middleware that combines project validation with
 * shell service validation.
 */
export function createProjectWithShellValidator(
  deps: ProjectValidatorDeps,
  shellService: ShellService | null,
  shellEnabled: boolean,
  shellDisabledMessage?: string
) {
  const projectValidator = createProjectValidator(deps);
  const shellValidator = createShellServiceValidator(
    shellService,
    shellEnabled,
    shellDisabledMessage
  );

  return [projectValidator, shellValidator];
}

/**
 * Composite middleware that combines project validation with
 * Ralph Loop service validation.
 */
export function createProjectWithRalphLoopValidator(
  deps: ProjectValidatorDeps,
  ralphLoopService: unknown
) {
  const projectValidator = createProjectValidator(deps);
  const ralphLoopValidator = createRalphLoopValidator(ralphLoopService);

  return [projectValidator, ralphLoopValidator];
}