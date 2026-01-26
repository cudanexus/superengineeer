/* eslint-disable @typescript-eslint/unbound-method */
import request from 'supertest';
import express, { Express } from 'express';
import { createSettingsRouter, SettingsChangeEvent } from '../../../src/routes/settings';
import { SettingsRepository } from '../../../src/repositories';
import { createErrorHandler } from '../../../src/utils/errors';
import {
  createMockSettingsRepository,
  DEFAULT_TEST_SETTINGS,
} from '../helpers/mock-factories';

interface ErrorResponse {
  error: string;
}

describe('SettingsRouter', () => {
  let mockRepository: jest.Mocked<SettingsRepository>;
  let app: Express;
  let onSettingsChange: jest.Mock<void, [SettingsChangeEvent]>;

  beforeEach(() => {
    mockRepository = createMockSettingsRepository();
    onSettingsChange = jest.fn<void, [SettingsChangeEvent]>();
    app = express();
    app.use(express.json());
    app.use('/settings', createSettingsRouter({
      settingsRepository: mockRepository,
      onSettingsChange,
    }));
    // Add error handler to convert ValidationError to proper response
    app.use(createErrorHandler());
  });

  describe('GET /settings', () => {
    it('should return current settings', async () => {
      const response = await request(app).get('/settings');

      expect(response.status).toBe(200);
      expect(mockRepository.get).toHaveBeenCalled();
      expect(response.body).toMatchObject({
        maxConcurrentAgents: DEFAULT_TEST_SETTINGS.maxConcurrentAgents,
        sendWithCtrlEnter: DEFAULT_TEST_SETTINGS.sendWithCtrlEnter,
      });
    });
  });

  describe('PUT /settings', () => {
    it('should update maxConcurrentAgents', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ maxConcurrentAgents: 5 });

      expect(response.status).toBe(200);
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ maxConcurrentAgents: 5 })
      );
      expect(onSettingsChange).toHaveBeenCalledWith({ maxConcurrentAgents: 5 });
    });

    it('should reject invalid maxConcurrentAgents (non-number)', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ maxConcurrentAgents: 'five' });

      expect(response.status).toBe(400);
      const body = response.body as ErrorResponse;
      expect(body.error).toContain('maxConcurrentAgents must be a positive number');
    });

    it('should reject invalid maxConcurrentAgents (less than 1)', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ maxConcurrentAgents: 0 });

      expect(response.status).toBe(400);
      const body = response.body as ErrorResponse;
      expect(body.error).toContain('maxConcurrentAgents must be a positive number');
    });

    it('should reject negative maxConcurrentAgents', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ maxConcurrentAgents: -1 });

      expect(response.status).toBe(400);
      const body = response.body as ErrorResponse;
      expect(body.error).toContain('maxConcurrentAgents must be a positive number');
    });

    it('should update sendWithCtrlEnter', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ sendWithCtrlEnter: false });

      expect(response.status).toBe(200);
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ sendWithCtrlEnter: false })
      );
    });

    it('should update historyLimit', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ historyLimit: 50 });

      expect(response.status).toBe(200);
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ historyLimit: 50 })
      );
    });

    it('should update agentPromptTemplate', async () => {
      const template = 'New template content';
      const response = await request(app)
        .put('/settings')
        .send({ agentPromptTemplate: template });

      expect(response.status).toBe(200);
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ agentPromptTemplate: template })
      );
    });

    it('should update enableDesktopNotifications', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ enableDesktopNotifications: false });

      expect(response.status).toBe(200);
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ enableDesktopNotifications: false })
      );
    });

    it('should notify when appendSystemPrompt changes', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ appendSystemPrompt: 'New prompt' });

      expect(response.status).toBe(200);
      expect(onSettingsChange).toHaveBeenCalledWith({ appendSystemPromptChanged: true });
    });

    it('should not notify when appendSystemPrompt is same as current', async () => {
      // Set initial appendSystemPrompt
      mockRepository = createMockSettingsRepository({ appendSystemPrompt: 'Same prompt' });
      app = express();
      app.use(express.json());
      app.use('/settings', createSettingsRouter({
        settingsRepository: mockRepository,
        onSettingsChange,
      }));
      app.use(createErrorHandler());

      const response = await request(app)
        .put('/settings')
        .send({ appendSystemPrompt: 'Same prompt' });

      expect(response.status).toBe(200);
      expect(onSettingsChange).not.toHaveBeenCalled();
    });

    describe('claudePermissions validation', () => {
      it('should accept valid allowRules', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              allowRules: ['Read', 'Write', 'Bash(npm run:*)'],
            },
          });

        expect(response.status).toBe(200);
        expect(mockRepository.update).toHaveBeenCalled();
      });

      it('should accept valid denyRules', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              denyRules: ['Read(./.env)', 'Bash(rm -rf:*)'],
            },
          });

        expect(response.status).toBe(200);
        expect(mockRepository.update).toHaveBeenCalled();
      });

      it('should accept valid askRules', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              askRules: ['Write', 'Bash(git:*)'],
            },
          });

        expect(response.status).toBe(200);
        expect(mockRepository.update).toHaveBeenCalled();
      });

      it('should reject invalid rule format (empty string)', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              allowRules: [''],
            },
          });

        expect(response.status).toBe(400);
        const body = response.body as ErrorResponse;
        expect(body.error).toContain('Invalid permission rule');
      });

      it('should reject invalid rule format (starts with number)', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              allowRules: ['123Invalid'],
            },
          });

        expect(response.status).toBe(400);
        const body = response.body as ErrorResponse;
        expect(body.error).toContain('Invalid permission rule');
      });

      it('should reject non-string rules', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              allowRules: [123],
            },
          });

        expect(response.status).toBe(400);
        const body = response.body as ErrorResponse;
        expect(body.error).toContain('must contain only strings');
      });

      it('should reject non-array rules', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              allowRules: 'Read',
            },
          });

        expect(response.status).toBe(400);
        const body = response.body as ErrorResponse;
        expect(body.error).toContain('must be an array');
      });

      it('should accept rules with specifiers containing special characters', async () => {
        const response = await request(app)
          .put('/settings')
          .send({
            claudePermissions: {
              allowRules: ['Bash(npm run test:*)', 'Read(./src/**/*.ts)'],
            },
          });

        expect(response.status).toBe(200);
        expect(mockRepository.update).toHaveBeenCalled();
      });
    });

    it('should update multiple settings at once', async () => {
      const response = await request(app)
        .put('/settings')
        .send({
          maxConcurrentAgents: 5,
          sendWithCtrlEnter: false,
          historyLimit: 50,
        });

      expect(response.status).toBe(200);
      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          maxConcurrentAgents: 5,
          sendWithCtrlEnter: false,
          historyLimit: 50,
        })
      );
    });

    it('should return updated settings', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ maxConcurrentAgents: 7 });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ maxConcurrentAgents: 7 });
    });

    it('should not call onSettingsChange when no relevant changes', async () => {
      const response = await request(app)
        .put('/settings')
        .send({ historyLimit: 50 });

      expect(response.status).toBe(200);
      expect(onSettingsChange).not.toHaveBeenCalled();
    });
  });
});
