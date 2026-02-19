import {
  createProjectSchema,
  updatePermissionsSchema,
  roadmapPromptSchema,
  deleteTaskSchema,
  agentMessageSchema,
  agentSendMessageSchema,
  shellResizeSchema,
  ralphLoopStartSchema,
  gitCommitSchema,
  projectIdSchema,
  projectAndTagNameSchema,
  projectAndTaskIdSchema,
} from '../../../../src/routes/projects/schemas';

describe('Project Route Schemas', () => {
  describe('createProjectSchema', () => {
    it('should validate correct project data', () => {
      const valid = {
        name: 'My Project',
        path: '/home/user/projects/my-project',
        createNew: true,
      };

      const result = createProjectSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should require name and path', () => {
      const invalid = { createNew: false };
      const result = createProjectSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept optional createNew', () => {
      const valid = {
        name: 'My Project',
        path: '/home/user/projects/my-project',
      };

      const result = createProjectSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should coerce string "false" to boolean false', () => {
      const input = {
        name: 'My Project',
        path: '/home/user/projects/my-project',
        createNew: 'false',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createNew).toBe(false);
      }
    });

    it('should coerce string "true" to boolean true', () => {
      const input = {
        name: 'My Project',
        path: '/home/user/projects/my-project',
        createNew: 'true',
      };

      const result = createProjectSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createNew).toBe(true);
      }
    });
  });

  describe('updatePermissionsSchema', () => {
    it('should validate permission updates', () => {
      const valid = {
        enabled: true,
        allowRules: ['Read', 'Write'],
        denyRules: ['Delete'],
        defaultMode: 'acceptEdits',
      };

      const result = updatePermissionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should allow partial updates', () => {
      const valid = { enabled: false };
      const result = updatePermissionsSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should validate defaultMode enum', () => {
      const invalid = { defaultMode: 'invalidMode' };
      const result = updatePermissionsSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('roadmapPromptSchema', () => {
    it('should require non-empty prompt', () => {
      const valid = { prompt: 'Generate a roadmap for a web app' };
      const result = roadmapPromptSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty prompt', () => {
      const invalid = { prompt: '' };
      const result = roadmapPromptSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('deleteTaskSchema', () => {
    it('should validate task deletion params', () => {
      const valid = {
        phaseId: 'phase-1',
        milestoneId: 'milestone-1',
        taskIndex: 0,
      };

      const result = deleteTaskSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should require non-negative taskIndex', () => {
      const invalid = {
        phaseId: 'phase-1',
        milestoneId: 'milestone-1',
        taskIndex: -1,
      };

      const result = deleteTaskSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('agentMessageSchema', () => {
    it('should validate agent message', () => {
      const valid = {
        message: 'Hello Claude',
        images: [{ type: 'image/png', data: 'base64imagedata' }],
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        permissionMode: 'plan',
      };

      const result = agentMessageSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should allow empty object', () => {
      const valid = {};
      const result = agentMessageSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('agentSendMessageSchema', () => {
    it('should require message', () => {
      const valid = {
        message: 'Hello Claude',
        images: [{ type: 'image/png', data: 'base64imagedata' }],
      };

      const result = agentSendMessageSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty message', () => {
      const invalid = { message: '' };
      const result = agentSendMessageSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('ralphLoopStartSchema', () => {
    it('should validate ralph loop start', () => {
      const valid = {
        taskDescription: 'Build a REST API',
        maxTurns: 5,
        workerModel: 'claude-3-sonnet',
        reviewerModel: 'claude-3-opus',
      };

      const result = ralphLoopStartSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should require taskDescription', () => {
      const invalid = {
        maxTurns: 5,
      };

      const result = ralphLoopStartSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should validate maxTurns range', () => {
      const invalid = {
        taskDescription: 'Build a REST API',
        maxTurns: 101,
      };

      const result = ralphLoopStartSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('gitCommitSchema', () => {
    it('should require commit message', () => {
      const valid = { message: 'feat: Add new feature' };
      const result = gitCommitSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty message', () => {
      const invalid = { message: '' };
      const result = gitCommitSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('projectIdSchema', () => {
    it('should validate UUID project ID', () => {
      const valid = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const result = projectIdSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept non-UUID strings', () => {
      const invalid = { id: 'not-a-uuid' };
      const result = projectIdSchema.safeParse(invalid);
      expect(result.success).toBe(true);
    });

    it('should reject empty string', () => {
      const invalid = { id: '' };
      const result = projectIdSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('shellResizeSchema', () => {
    it('should validate terminal dimensions', () => {
      const valid = { cols: 80, rows: 24 };
      const result = shellResizeSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should require positive dimensions', () => {
      const invalid = { cols: 0, rows: 24 };
      const result = shellResizeSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('projectAndTagNameSchema', () => {
    it('should accept path-based project IDs', () => {
      const valid = { id: 'D__Development_Typescript_superengineer', name: '0.11.0' };
      const result = projectAndTagNameSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept UUID project IDs', () => {
      const valid = { id: '123e4567-e89b-12d3-a456-426614174000', name: 'v1.0.0' };
      const result = projectAndTagNameSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty project ID', () => {
      const invalid = { id: '', name: 'v1.0.0' };
      const result = projectAndTagNameSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty tag name', () => {
      const invalid = { id: 'some-project', name: '' };
      const result = projectAndTagNameSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should accept tag names with dots and slashes', () => {
      const valid = { id: 'my-project', name: 'release/1.2.3' };
      const result = projectAndTagNameSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('projectAndTaskIdSchema', () => {
    it('should accept path-based project IDs', () => {
      const valid = { id: 'D__Development_Typescript_superengineer', taskId: 'task-123' };
      const result = projectAndTaskIdSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept UUID project IDs', () => {
      const valid = { id: '123e4567-e89b-12d3-a456-426614174000', taskId: 'task-456' };
      const result = projectAndTaskIdSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject empty project ID', () => {
      const invalid = { id: '', taskId: 'task-123' };
      const result = projectAndTaskIdSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject empty task ID', () => {
      const invalid = { id: 'some-project', taskId: '' };
      const result = projectAndTaskIdSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});