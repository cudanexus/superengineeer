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
  },
}));

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
      );

      expect(prompt).toContain('web, api');
      expect(prompt).toContain('games, dev-tools');
    });

    it('should ask for 5 ideas with structured markers', () => {
      const prompt = service.buildBrainstormPrompt(
        ['web'],
        ['games'],
      );

      expect(prompt).toContain('IDEA_1_NAME');
      expect(prompt).toContain('IDEA_1_TAGLINE');
      expect(prompt).toContain('IDEA_1_DESCRIPTION');
      expect(prompt).toContain('IDEA_5');
      expect(prompt).toContain('exactly 5');
    });
  });

  describe('buildPlanPrompt', () => {
    it('should include idea details and plan markers', () => {
      const prompt = service.buildPlanPrompt({
        name: 'pixel-garden',
        tagline: 'Grow pixels',
        description: 'A pixel growing app',
      });

      expect(prompt).toContain('pixel-garden');
      expect(prompt).toContain('Grow pixels');
      expect(prompt).toContain('A pixel growing app');
      expect(prompt).toContain('PROJECT_NAME');
      expect(prompt).toContain('PLAN_START');
      expect(prompt).toContain('PLAN_END');
    });
  });

  describe('parseIdeas', () => {
    it('should parse 5 ideas from valid output', () => {
      const output = buildFiveIdeasOutput();
      const ideas = service.parseIdeas(output);

      expect(ideas).toHaveLength(5);
      expect(ideas[0]!.name).toBe('pixel-garden');
      expect(ideas[0]!.tagline).toBe('Grow your own pixel forest');
      expect(ideas[0]!.description).toContain('virtual garden');
      expect(ideas[4]!.name).toBe('data-flow');
    });

    it('should parse fewer than 5 if some are missing', () => {
      const output = [
        'IDEA_1_NAME: project-one',
        'IDEA_1_TAGLINE: First project',
        'IDEA_1_DESCRIPTION: A first project idea.',
        'IDEA_3_NAME: project-three',
        'IDEA_3_TAGLINE: Third project',
        'IDEA_3_DESCRIPTION: A third project idea.',
      ].join('\n');

      const ideas = service.parseIdeas(output);

      expect(ideas).toHaveLength(2);
      expect(ideas[0]!.name).toBe('project-one');
      expect(ideas[1]!.name).toBe('project-three');
    });

    it('should throw if no ideas can be parsed', () => {
      expect(() => service.parseIdeas('no ideas here')).toThrow(
        'Could not parse any ideas',
      );
    });

    it('should skip ideas with incomplete markers', () => {
      const output = [
        'IDEA_1_NAME: complete-idea',
        'IDEA_1_TAGLINE: Has all fields',
        'IDEA_1_DESCRIPTION: Complete description.',
        'IDEA_2_NAME: incomplete-idea',
        'IDEA_2_TAGLINE: Missing description',
      ].join('\n');

      const ideas = service.parseIdeas(output);

      expect(ideas).toHaveLength(1);
      expect(ideas[0]!.name).toBe('complete-idea');
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
        inventifyFolder: '/test/inventify',
      });

      await expect(
        service.start({
          projectTypes: ['cli'],
          themes: ['dev-tools'],
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

  describe('selectIdea', () => {
    it('should throw if no pending ideas', async () => {
      await expect(service.selectIdea(0)).rejects.toThrow(
        'No pending ideas to select from',
      );
    });
  });
});

function buildFiveIdeasOutput(): string {
  return [
    'IDEA_1_NAME: pixel-garden',
    'IDEA_1_TAGLINE: Grow your own pixel forest',
    'IDEA_1_DESCRIPTION: A virtual garden where you grow pixel plants.',
    '',
    'IDEA_2_NAME: code-quest',
    'IDEA_2_TAGLINE: Learn coding through adventure',
    'IDEA_2_DESCRIPTION: An RPG-style game to teach programming.',
    '',
    'IDEA_3_NAME: task-ninja',
    'IDEA_3_TAGLINE: Slash through your todo list',
    'IDEA_3_DESCRIPTION: A gamified task manager with ninja themes.',
    '',
    'IDEA_4_NAME: beat-box',
    'IDEA_4_TAGLINE: Make music in your browser',
    'IDEA_4_DESCRIPTION: A web-based drum machine and sequencer.',
    '',
    'IDEA_5_NAME: data-flow',
    'IDEA_5_TAGLINE: Visualize your data pipelines',
    'IDEA_5_DESCRIPTION: A tool for building and monitoring ETL flows.',
  ].join('\n');
}
