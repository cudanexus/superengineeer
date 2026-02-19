import { DefaultInventifyService, ParsedOutput } from '../../../src/services/inventify-service';
import {
  createMockAgentManager,
  createMockProjectService,
  createMockRalphLoopService,
  createMockSettingsRepository,
} from '../helpers/mock-factories';
import { Logger } from '../../../src/utils/logger';

// Mock fs
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue('# Plan content'),
  },
}));

import fs from 'fs';
const mockReadFile = fs.promises.readFile as jest.Mock;

function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    withProject: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Logger>;
}

describe('DefaultInventifyService', () => {
  let service: DefaultInventifyService;
  let mockLogger: jest.Mocked<Logger>;
  let mockAgentManager: ReturnType<typeof createMockAgentManager>;
  let mockProjectService: ReturnType<typeof createMockProjectService>;
  let mockRalphLoopService: ReturnType<typeof createMockRalphLoopService>;
  let mockSettingsRepository: ReturnType<typeof createMockSettingsRepository>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockAgentManager = createMockAgentManager();
    mockProjectService = createMockProjectService();
    mockRalphLoopService = createMockRalphLoopService();
    mockSettingsRepository = createMockSettingsRepository({
      inventifyFolder: '/test/inventify',
    });

    service = new DefaultInventifyService({
      logger: mockLogger,
      agentManager: mockAgentManager,
      projectService: mockProjectService,
      ralphLoopService: mockRalphLoopService,
      settingsRepository: mockSettingsRepository,
    });
  });

  describe('buildBrainstormPrompt', () => {
    it('should include project types and themes', () => {
      const prompt = service.buildBrainstormPrompt(
        ['web', 'api'],
        ['games', 'dev-tools'],
        [],
        [],
        '',
      );

      expect(prompt).toContain('web, api');
      expect(prompt).toContain('games, dev-tools');
    });

    it('should ask for 5 ideas as JSON', () => {
      const prompt = service.buildBrainstormPrompt(
        ['web'],
        ['games'],
        [],
        [],
        '',
      );

      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('exactly 5');
      expect(prompt).toContain('"name"');
      expect(prompt).toContain('"tagline"');
      expect(prompt).toContain('"description"');
    });

    it('should include languages when provided', () => {
      const prompt = service.buildBrainstormPrompt(
        ['web'],
        ['games'],
        ['TypeScript', 'Rust'],
        [],
        '',
      );

      expect(prompt).toContain('**Languages**: TypeScript, Rust');
    });

    it('should include technologies when provided', () => {
      const prompt = service.buildBrainstormPrompt(
        ['web'],
        ['games'],
        [],
        ['React', 'Express'],
        '',
      );

      expect(prompt).toContain('**Technologies/Frameworks**: React, Express');
    });

    it('should include custom prompt when provided', () => {
      const prompt = service.buildBrainstormPrompt(
        ['web'],
        ['games'],
        [],
        [],
        'Focus on real-time features',
      );

      expect(prompt).toContain('**Additional Instructions**: Focus on real-time features');
    });

    it('should omit empty optional sections', () => {
      const prompt = service.buildBrainstormPrompt(
        ['web'],
        ['games'],
        [],
        [],
        '',
      );

      expect(prompt).not.toContain('**Languages**');
      expect(prompt).not.toContain('**Technologies');
      expect(prompt).not.toContain('**Additional Instructions**');
    });
  });

  describe('buildPlanPrompt', () => {
    it('should include idea details and doc/plan.md instruction', () => {
      const prompt = service.buildPlanPrompt({
        name: 'pixel-garden',
        tagline: 'Grow pixels',
        description: 'A pixel growing app',
      }, 'flora-sim');

      expect(prompt).toContain('flora-sim');
      expect(prompt).toContain('pixel-garden');
      expect(prompt).toContain('Grow pixels');
      expect(prompt).toContain('A pixel growing app');
      expect(prompt).toContain('doc/plan.md');
    });
  });

  describe('buildNameSuggestionPrompt', () => {
    it('should include idea details and ask for 5 names', () => {
      const prompt = service.buildNameSuggestionPrompt({
        name: 'pixel-garden',
        tagline: 'Grow pixels',
        description: 'A pixel growing app',
      });

      expect(prompt).toContain('pixel-garden');
      expect(prompt).toContain('Grow pixels');
      expect(prompt).toContain('exactly 5');
      expect(prompt).toContain('JSON array');
    });
  });

  describe('parseIdeas', () => {
    it('should parse 5 ideas from valid JSON output', () => {
      const output = buildFiveIdeasOutput();
      const ideas = service.parseIdeas(output);

      expect(ideas).toHaveLength(5);
      expect(ideas[0]!.name).toBe('pixel-garden');
      expect(ideas[0]!.tagline).toBe('Grow your own pixel forest');
      expect(ideas[0]!.description).toContain('virtual garden');
      expect(ideas[4]!.name).toBe('data-flow');
    });

    it('should parse JSON wrapped in code fences', () => {
      const output = '```json\n' + JSON.stringify([
        { name: 'project-one', tagline: 'First', description: 'Desc one.' },
        { name: 'project-two', tagline: 'Second', description: 'Desc two.' },
      ], null, 2) + '\n```';

      const ideas = service.parseIdeas(output);

      expect(ideas).toHaveLength(2);
      expect(ideas[0]!.name).toBe('project-one');
      expect(ideas[1]!.name).toBe('project-two');
    });

    it('should parse JSON with surrounding text', () => {
      const output = 'Here are my ideas:\n\n' + JSON.stringify([
        { name: 'my-app', tagline: 'Cool app', description: 'A cool app.' },
      ]) + '\n\nHope you like them!';

      const ideas = service.parseIdeas(output);

      expect(ideas).toHaveLength(1);
      expect(ideas[0]!.name).toBe('my-app');
    });

    it('should throw if no ideas can be parsed', () => {
      expect(() => service.parseIdeas('no ideas here')).toThrow(
        'Could not parse any ideas',
      );
    });

    it('should throw on invalid JSON', () => {
      expect(() => service.parseIdeas('[{invalid json}')).toThrow(
        'Could not parse any ideas',
      );
    });

    it('should skip objects missing required fields', () => {
      const output = JSON.stringify([
        { name: 'valid-idea', tagline: 'Good', description: 'Has all fields.' },
        { name: 'bad-idea', tagline: 'Missing description' },
        { tagline: 'No name', description: 'Missing name field.' },
      ]);

      const ideas = service.parseIdeas(output);

      expect(ideas).toHaveLength(1);
      expect(ideas[0]!.name).toBe('valid-idea');
    });
  });

  describe('parseAgentOutput', () => {
    it('should extract name and plan from valid output', () => {
      const output = `Some intro text...

PROJECT_NAME: my-cool-project

Some more text...

PLAN_START
# My Cool Project

## Overview
This project does cool things.

## Features
- Feature 1
- Feature 2
PLAN_END

Done!`;

      const result: ParsedOutput = service.parseAgentOutput(output);

      expect(result.name).toBe('my-cool-project');
      expect(result.plan).toContain('# My Cool Project');
      expect(result.plan).toContain('Feature 1');
    });

    it('should throw if project name is missing', () => {
      const output = `No name here...
PLAN_START
Some plan
PLAN_END`;

      expect(() => service.parseAgentOutput(output)).toThrow(
        'Could not parse project name',
      );
    });

    it('should throw if plan markers are missing', () => {
      const output = 'PROJECT_NAME: my-project\nNo plan markers here.';

      expect(() => service.parseAgentOutput(output)).toThrow(
        'Could not parse plan',
      );
    });

    it('should lowercase the project name', () => {
      const output = `PROJECT_NAME: My-Project-123
PLAN_START
Plan content
PLAN_END`;

      const result = service.parseAgentOutput(output);

      expect(result.name).toBe('my-project-123');
    });
  });

  describe('start', () => {
    it('should create project and start one-off agent', async () => {
      const result = await service.start({
        projectTypes: ['web'],
        themes: ['games'],
        languages: [],
        technologies: [],
        customPrompt: '',
        inventifyFolder: '/test/inventify',
      });

      expect(result.oneOffId).toBe('oneoff-test-id');
      expect(result.placeholderProjectId).toBe('new-project-id');
      expect(mockProjectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          createNew: false,
        }),
      );
      expect(mockAgentManager.startOneOffAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'new-project-id',
          label: 'Inventify Brainstorm',
        }),
      );
    });

    it('should throw if already running', async () => {
      await service.start({
        projectTypes: ['web'],
        themes: ['games'],
        languages: [],
        technologies: [],
        customPrompt: '',
        inventifyFolder: '/test/inventify',
      });

      await expect(
        service.start({
          projectTypes: ['cli'],
          themes: ['dev-tools'],
          languages: [],
          technologies: [],
          customPrompt: '',
          inventifyFolder: '/test/inventify',
        }),
      ).rejects.toThrow('Inventify is already running');
    });

    it('should throw if project creation fails', async () => {
      mockProjectService.createProject.mockResolvedValue({
        success: false,
        error: 'Folder does not exist',
      });

      await expect(
        service.start({
          projectTypes: ['web'],
          themes: ['games'],
          languages: [],
          technologies: [],
          customPrompt: '',
          inventifyFolder: '/nonexistent',
        }),
      ).rejects.toThrow('Failed to create placeholder project');
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      expect(service.isRunning()).toBe(false);
    });

    it('should return true after starting', async () => {
      await service.start({
        projectTypes: ['web'],
        themes: ['games'],
        languages: [],
        technologies: [],
        customPrompt: '',
        inventifyFolder: '/test/inventify',
      });

      expect(service.isRunning()).toBe(true);
    });
  });

  describe('getIdeas', () => {
    it('should return null initially', () => {
      expect(service.getIdeas()).toBeNull();
    });
  });

  describe('parseNames', () => {
    it('should parse 5 names from valid JSON output', () => {
      const output = '["alpha", "beta", "gamma", "delta", "epsilon"]';
      const names = service.parseNames(output);

      expect(names).toHaveLength(5);
      expect(names[0]).toBe('alpha');
      expect(names[4]).toBe('epsilon');
    });

    it('should parse names wrapped in code fences', () => {
      const output = '```json\n["one", "two", "three"]\n```';
      const names = service.parseNames(output);

      expect(names).toHaveLength(3);
    });

    it('should lowercase names', () => {
      const output = '["My-App", "COOL-TOOL"]';
      const names = service.parseNames(output);

      expect(names[0]).toBe('my-app');
      expect(names[1]).toBe('cool-tool');
    });

    it('should throw on invalid output', () => {
      expect(() => service.parseNames('not json')).toThrow(
        'Could not parse name suggestions',
      );
    });

    it('should throw on empty array', () => {
      expect(() => service.parseNames('[]')).toThrow(
        'Could not parse name suggestions',
      );
    });
  });

  describe('parsePlan', () => {
    it('should extract plan content', () => {
      const output = 'prefix\nPLAN_START\n# My Plan\n## Goals\nPLAN_END\nsuffix';
      const plan = service.parsePlan(output);

      expect(plan).toBe('# My Plan\n## Goals');
    });

    it('should throw if plan markers missing', () => {
      expect(() => service.parsePlan('no markers here')).toThrow(
        'Could not parse plan',
      );
    });
  });

  describe('selectIdea validation', () => {
    it('should throw if no pending ideas', async () => {
      await expect(service.selectIdea(0, 'my-project')).rejects.toThrow(
        'No pending ideas to select from',
      );
    });
  });

  describe('suggestNames', () => {
    it('should throw if no pending ideas', async () => {
      await expect(service.suggestNames(0)).rejects.toThrow(
        'No pending ideas to select from',
      );
    });
  });

  describe('cancel', () => {
    it('should stop the session agent when active', async () => {
      await startAndCompleteBrainstorm();

      mockAgentManager.stopOneOffAgent.mockClear();
      await service.cancel();

      expect(mockAgentManager.stopOneOffAgent).toHaveBeenCalledWith(
        'oneoff-test-id',
      );
    });

    it('should clean up all state', async () => {
      await startAndCompleteBrainstorm();

      await service.cancel();

      expect(service.isRunning()).toBe(false);
      expect(service.getIdeas()).toBeNull();
      expect(service.getNameSuggestions()).toBeNull();
      expect(service.getBuildResult()).toBeNull();
    });
  });

  async function startAndCompleteBrainstorm(): Promise<void> {
    await service.start({
      projectTypes: ['web'],
      themes: ['games'],
      languages: [],
      technologies: [],
      customPrompt: '',
      inventifyFolder: '/test/inventify',
    });

    const handlers = getRegisteredHandlers(mockAgentManager);
    const ideasJson = buildFiveIdeasOutput();

    handlers.oneOffMessage!('oneoff-test-id', {
      type: 'result',
      content: ideasJson,
    });
    handlers.oneOffWaiting!('oneoff-test-id', true, 1);

    mockAgentManager.on.mockClear();
  }

  describe('brainstorm completion via oneOffWaiting', () => {
    it('should parse ideas when agent goes to waiting state', async () => {
      await service.start({
        projectTypes: ['web'],
        themes: ['games'],
        languages: [],
        technologies: [],
        customPrompt: '',
        inventifyFolder: '/test/inventify',
      });

      const handlers = getRegisteredHandlers(mockAgentManager);
      const ideasJson = buildFiveIdeasOutput();

      handlers.oneOffMessage!('oneoff-test-id', {
        type: 'result',
        content: ideasJson,
      });
      handlers.oneOffWaiting!('oneoff-test-id', true, 1);

      expect(service.getIdeas()).toHaveLength(5);
      expect(service.isRunning()).toBe(false);
      expect(mockAgentManager.stopOneOffAgent).not.toHaveBeenCalled();
    });

    it('should ignore waiting events for other oneOffIds', async () => {
      await service.start({
        projectTypes: ['web'],
        themes: ['games'],
        languages: [],
        technologies: [],
        customPrompt: '',
        inventifyFolder: '/test/inventify',
      });

      const handlers = getRegisteredHandlers(mockAgentManager);

      handlers.oneOffWaiting!('other-id', true, 1);

      expect(service.isRunning()).toBe(true);
      expect(mockAgentManager.stopOneOffAgent).not.toHaveBeenCalled();
    });

    it('should ignore isWaiting=false events', async () => {
      await service.start({
        projectTypes: ['web'],
        themes: ['games'],
        languages: [],
        technologies: [],
        customPrompt: '',
        inventifyFolder: '/test/inventify',
      });

      const handlers = getRegisteredHandlers(mockAgentManager);

      handlers.oneOffWaiting!('oneoff-test-id', false, 1);

      expect(service.isRunning()).toBe(true);
      expect(mockAgentManager.stopOneOffAgent).not.toHaveBeenCalled();
    });

    it('should remove all listeners on waiting completion', async () => {
      await service.start({
        projectTypes: ['web'],
        themes: ['games'],
        languages: [],
        technologies: [],
        customPrompt: '',
        inventifyFolder: '/test/inventify',
      });

      const handlers = getRegisteredHandlers(mockAgentManager);
      const ideasJson = buildFiveIdeasOutput();

      handlers.oneOffMessage!('oneoff-test-id', {
        type: 'result',
        content: ideasJson,
      });
      handlers.oneOffWaiting!('oneoff-test-id', true, 1);

      expect(mockAgentManager.off).toHaveBeenCalledWith(
        'oneOffMessage',
        expect.any(Function),
      );
      expect(mockAgentManager.off).toHaveBeenCalledWith(
        'oneOffStatus',
        expect.any(Function),
      );
      expect(mockAgentManager.off).toHaveBeenCalledWith(
        'oneOffWaiting',
        expect.any(Function),
      );
    });
  });

  describe('name suggestion completion via oneOffWaiting', () => {
    it('should send input to session agent instead of starting new one', async () => {
      await startAndCompleteBrainstorm();

      mockAgentManager.sendOneOffInput.mockClear();
      mockAgentManager.startOneOffAgent.mockClear();
      const result = await service.suggestNames(0);

      expect(result.oneOffId).toBe('oneoff-test-id');
      expect(mockAgentManager.sendOneOffInput).toHaveBeenCalledWith(
        'oneoff-test-id',
        expect.stringContaining('naming expert'),
      );
      expect(mockAgentManager.startOneOffAgent).not.toHaveBeenCalled();
    });

    it('should parse names when agent goes to waiting state', async () => {
      await startAndCompleteBrainstorm();

      mockAgentManager.on.mockClear();
      const result = await service.suggestNames(0);
      const handlers = getRegisteredHandlers(mockAgentManager);
      const namesJson = '["alpha", "beta", "gamma", "delta", "epsilon"]';

      handlers.oneOffMessage!(result.oneOffId, {
        type: 'result',
        content: namesJson,
      });
      handlers.oneOffWaiting!(result.oneOffId, true, 1);

      const suggestions = service.getNameSuggestions();

      expect(suggestions).not.toBeNull();
      expect(suggestions!.names).toHaveLength(5);
      expect(suggestions!.ideaIndex).toBe(0);
      expect(service.isRunning()).toBe(false);
      expect(mockAgentManager.stopOneOffAgent).not.toHaveBeenCalled();
    });
  });

  describe('selectIdea', () => {
    it('should rename directory and update project', async () => {
      await startAndCompleteBrainstorm();

      mockAgentManager.on.mockClear();
      const result = await service.selectIdea(0, 'my-project');

      expect(mockProjectService.updateProjectPath).toHaveBeenCalledWith(
        'new-project-id',
        'my-project',
        expect.stringContaining('my-project'),
      );
      expect(result.newProjectId).toBeDefined();
    });

    it('should stop the session agent', async () => {
      await startAndCompleteBrainstorm();

      mockAgentManager.stopOneOffAgent.mockClear();
      await service.selectIdea(0, 'my-project');

      expect(mockAgentManager.stopOneOffAgent).toHaveBeenCalledWith(
        'oneoff-test-id',
      );
    });

    it('should not start any agent', async () => {
      await startAndCompleteBrainstorm();

      mockAgentManager.startOneOffAgent.mockClear();
      await service.selectIdea(0, 'my-project');

      expect(mockAgentManager.startOneOffAgent).not.toHaveBeenCalled();
    });

    it('should return prompt and newProjectId', async () => {
      await startAndCompleteBrainstorm();

      mockAgentManager.on.mockClear();
      const result = await service.selectIdea(0, 'my-project');

      expect(result.newProjectId).toBeDefined();
      expect(result.placeholderProjectId).toBe('new-project-id');
      expect(result.prompt).toBeDefined();
      expect(result.prompt).toContain('pixel-garden');
    });

    it('should clean up state after selection', async () => {
      await startAndCompleteBrainstorm();

      await service.selectIdea(0, 'my-project');

      expect(service.getIdeas()).toBeNull();
      expect(service.getNameSuggestions()).toBeNull();
    });
  });

  describe('completeBuild', () => {
    it('should read plan from doc/plan.md and start Ralph Loop', async () => {
      mockReadFile.mockResolvedValue('# My Plan\n## Goals\n- Goal 1');

      await service.completeBuild('project-123', '/test/inventify/my-project');

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('plan.md'),
        'utf-8',
      );
      expect(mockRalphLoopService.start).toHaveBeenCalledWith(
        'project-123',
        expect.any(Object),
      );
    });

    it('should set build result after completion', async () => {
      expect(service.getBuildResult()).toBeNull();

      mockReadFile.mockResolvedValue('# Plan');

      await service.completeBuild('project-123', '/test/inventify/my-project');

      const buildResult = service.getBuildResult();

      expect(buildResult).not.toBeNull();
      expect(buildResult!.newProjectId).toBe('project-123');
      expect(buildResult!.projectName).toBe('my-project');
    });

    it('should throw if plan file cannot be read', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(
        service.completeBuild('project-123', '/test/inventify/my-project'),
      ).rejects.toThrow('File not found');
    });
  });
});

function getRegisteredHandlers(
  manager: ReturnType<typeof createMockAgentManager>,
): Record<string, (...args: unknown[]) => void> {
  const handlers: Record<string, (...args: unknown[]) => void> = {};

  for (const call of manager.on.mock.calls) {
    const [event, handler] = call;
    handlers[event as string] = handler as (...args: unknown[]) => void;
  }

  return handlers;
}


function buildFiveIdeasOutput(): string {
  return JSON.stringify([
    { name: 'pixel-garden', tagline: 'Grow your own pixel forest', description: 'A virtual garden where you grow pixel plants.' },
    { name: 'code-quest', tagline: 'Learn coding through adventure', description: 'An RPG-style game to teach programming.' },
    { name: 'task-ninja', tagline: 'Slash through your todo list', description: 'A gamified task manager with ninja themes.' },
    { name: 'beat-box', tagline: 'Make music in your browser', description: 'A web-based drum machine and sequencer.' },
    { name: 'data-flow', tagline: 'Visualize your data pipelines', description: 'A tool for building and monitoring ETL flows.' },
  ], null, 2);
}
