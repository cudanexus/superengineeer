import fs from 'fs';
import path from 'path';
import { generateUUID } from '../utils/uuid';
import { Logger } from '../utils/logger';
import { AgentManager } from '../agents/agent-manager';
import { AgentMessage, AgentStatus } from '../agents/claude-agent';
import { ProjectService } from './project';
import { RalphLoopService, RalphLoopConfig } from './ralph-loop/types';
import { SettingsRepository } from '../repositories/settings';
import {
  InventifyService,
  InventifyRequest,
  InventifyResult,
  InventifyIdea,
} from './inventify-types';

export interface InventifyServiceDependencies {
  logger: Logger;
  agentManager: AgentManager;
  projectService: ProjectService;
  ralphLoopService: RalphLoopService;
  settingsRepository: SettingsRepository;
}

export interface ParsedOutput {
  name: string;
  plan: string;
}

interface PendingState {
  request: InventifyRequest;
  placeholderProjectId: string;
  placeholderPath: string;
}

export class DefaultInventifyService implements InventifyService {
  private readonly logger: Logger;
  private readonly agentManager: AgentManager;
  private readonly projectService: ProjectService;
  private readonly ralphLoopService: RalphLoopService;
  private readonly settingsRepository: SettingsRepository;
  private activeOneOffId: string | null = null;
  private collectedOutput = '';
  private pendingIdeas: InventifyIdea[] | null = null;
  private pendingState: PendingState | null = null;

  constructor(deps: InventifyServiceDependencies) {
    this.logger = deps.logger;
    this.agentManager = deps.agentManager;
    this.projectService = deps.projectService;
    this.ralphLoopService = deps.ralphLoopService;
    this.settingsRepository = deps.settingsRepository;
  }

  async start(request: InventifyRequest): Promise<InventifyResult> {
    if (this.activeOneOffId) {
      throw new Error('Inventify is already running');
    }

    this.pendingIdeas = null;
    this.pendingState = null;

    const placeholderName = `inventify-${generateUUID().slice(0, 8)}`;
    const placeholderPath = path.join(
      request.inventifyFolder,
      placeholderName,
    );

    await fs.promises.mkdir(placeholderPath, { recursive: true });

    const createResult = await this.projectService.createProject({
      path: placeholderPath,
      createNew: false,
    });

    if (!createResult.success || !createResult.project) {
      throw new Error(
        `Failed to create placeholder project: ${createResult.error}`,
      );
    }

    const placeholderProjectId = createResult.project.id;
    const prompt = this.buildBrainstormPrompt(
      request.projectTypes,
      request.themes,
    );

    const oneOffId = await this.agentManager.startOneOffAgent({
      projectId: placeholderProjectId,
      message: prompt,
      permissionMode: 'acceptEdits',
      label: 'Inventify Brainstorm',
    });

    this.activeOneOffId = oneOffId;
    this.collectedOutput = '';

    this.pendingState = {
      request,
      placeholderProjectId,
      placeholderPath,
    };

    this.setupBrainstormListeners(oneOffId);

    return { oneOffId, placeholderProjectId };
  }

  isRunning(): boolean {
    return this.activeOneOffId !== null;
  }

  getIdeas(): InventifyIdea[] | null {
    return this.pendingIdeas;
  }

  async selectIdea(index: number): Promise<InventifyResult> {
    if (!this.pendingIdeas || !this.pendingState) {
      throw new Error('No pending ideas to select from');
    }

    if (index < 0 || index >= this.pendingIdeas.length) {
      throw new Error(
        `Invalid idea index: ${index}. Must be 0-${this.pendingIdeas.length - 1}`,
      );
    }

    if (this.activeOneOffId) {
      throw new Error('Inventify is already running');
    }

    const idea = this.pendingIdeas[index]!;
    const { placeholderProjectId } = this.pendingState;
    const prompt = this.buildPlanPrompt(idea);

    const oneOffId = await this.agentManager.startOneOffAgent({
      projectId: placeholderProjectId,
      message: prompt,
      permissionMode: 'acceptEdits',
      label: `Inventify Plan: ${idea.name}`,
    });

    this.activeOneOffId = oneOffId;
    this.collectedOutput = '';

    this.setupBuildListeners(oneOffId);

    return { oneOffId, placeholderProjectId };
  }

  private setupBrainstormListeners(oneOffId: string): void {
    const messageHandler = (
      msgOneOffId: string,
      message: AgentMessage,
    ): void => {
      if (msgOneOffId !== oneOffId) return;

      if (message.type === 'stdout') {
        this.collectedOutput += message.content;
      }
    };

    const statusHandler = (
      statusOneOffId: string,
      status: AgentStatus,
    ): void => {
      if (statusOneOffId !== oneOffId) return;

      if (status !== 'stopped' && status !== 'error') return;

      this.agentManager.off('oneOffStatus', statusHandler);
      this.agentManager.off('oneOffMessage', messageHandler);

      const output = this.collectedOutput;
      this.activeOneOffId = null;
      this.collectedOutput = '';

      if (status === 'stopped') {
        this.handleBrainstormCompletion(output);
      }
    };

    this.agentManager.on('oneOffMessage', messageHandler);
    this.agentManager.on('oneOffStatus', statusHandler);
  }

  private setupBuildListeners(oneOffId: string): void {
    const messageHandler = (
      msgOneOffId: string,
      message: AgentMessage,
    ): void => {
      if (msgOneOffId !== oneOffId) return;

      if (message.type === 'stdout') {
        this.collectedOutput += message.content;
      }
    };

    const statusHandler = (
      statusOneOffId: string,
      status: AgentStatus,
    ): void => {
      if (statusOneOffId !== oneOffId) return;

      if (status !== 'stopped' && status !== 'error') return;

      this.agentManager.off('oneOffStatus', statusHandler);
      this.agentManager.off('oneOffMessage', messageHandler);

      const output = this.collectedOutput;
      this.activeOneOffId = null;
      this.collectedOutput = '';

      if (status === 'stopped' && this.pendingState) {
        void this.handleBuildCompletion(output);
      }
    };

    this.agentManager.on('oneOffMessage', messageHandler);
    this.agentManager.on('oneOffStatus', statusHandler);
  }

  private handleBrainstormCompletion(output: string): void {
    try {
      const ideas = this.parseIdeas(output);
      this.pendingIdeas = ideas;

      this.logger.info('Inventify brainstorm completed', {
        ideaCount: ideas.length,
      });
    } catch (error) {
      this.logger.error('Failed to parse brainstorm ideas', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.pendingIdeas = null;
      this.pendingState = null;
    }
  }

  private async handleBuildCompletion(output: string): Promise<void> {
    if (!this.pendingState) return;

    const { placeholderProjectId, placeholderPath, request } =
      this.pendingState;

    try {
      const parsed = this.parseAgentOutput(output);
      const finalPath = path.join(request.inventifyFolder, parsed.name);

      await this.renameDirectory(placeholderPath, finalPath);
      await this.writePlan(finalPath, parsed.plan);
      await this.startRalphLoop(placeholderProjectId, parsed.plan);

      this.logger.info('Inventify build completed', {
        name: parsed.name,
        projectId: placeholderProjectId,
      });
    } catch (error) {
      this.logger.error('Inventify build completion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: placeholderProjectId,
      });
    } finally {
      this.pendingIdeas = null;
      this.pendingState = null;
    }
  }

  private async renameDirectory(
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    if (oldPath === newPath) return;

    await fs.promises.rename(oldPath, newPath);
  }

  private async writePlan(
    projectPath: string,
    plan: string,
  ): Promise<void> {
    const docDir = path.join(projectPath, 'doc');

    await fs.promises.mkdir(docDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(docDir, 'plan.md'),
      plan,
      'utf-8',
    );
  }

  private async startRalphLoop(
    projectId: string,
    plan: string,
  ): Promise<void> {
    const settings = await this.settingsRepository.get();

    const config: RalphLoopConfig = {
      maxTurns: settings.ralphLoop.defaultMaxTurns,
      workerModel: settings.ralphLoop.defaultWorkerModel,
      reviewerModel: settings.ralphLoop.defaultReviewerModel,
      taskDescription: buildRalphTaskDescription(plan),
    };

    await this.ralphLoopService.start(projectId, config);
  }

  buildBrainstormPrompt(
    projectTypes: string[],
    themes: string[],
  ): string {
    const types = projectTypes.join(', ');
    const themeList = themes.join(', ');

    return [
      'You are a creative software project inventor.',
      '',
      `**Project Types**: ${types}`,
      `**Themes**: ${themeList}`,
      '',
      'Invent exactly 5 creative, practical project ideas.',
      'Each idea must have a unique name, tagline, and description.',
      '',
      'You MUST output each idea using these exact markers:',
      '',
      'IDEA_1_NAME: project-name (lowercase, numbers, hyphens only)',
      'IDEA_1_TAGLINE: A catchy one-liner',
      'IDEA_1_DESCRIPTION: 2-3 sentences describing the project',
      '',
      'IDEA_2_NAME: another-project',
      'IDEA_2_TAGLINE: Another catchy line',
      'IDEA_2_DESCRIPTION: 2-3 sentences',
      '',
      '...and so on for IDEA_3, IDEA_4, IDEA_5.',
      '',
      'Make each idea distinct and interesting.',
      'Cover different approaches to the given types and themes.',
    ].join('\n');
  }

  buildPlanPrompt(idea: InventifyIdea): string {
    return [
      'You are a software architect creating a detailed plan.',
      '',
      `**Project**: ${idea.name}`,
      `**Tagline**: ${idea.tagline}`,
      `**Description**: ${idea.description}`,
      '',
      'Create a detailed implementation plan. You MUST:',
      '',
      '1. Output: PROJECT_NAME: ' + idea.name,
      '2. Write a detailed implementation plan covering:',
      '   - Overview and goals',
      '   - Technology stack',
      '   - Core features (prioritized)',
      '   - Architecture and file structure',
      '   - Implementation phases with tasks',
      '3. Wrap the plan between PLAN_START and PLAN_END markers',
      '',
      'Example format:',
      `PROJECT_NAME: ${idea.name}`,
      '',
      'PLAN_START',
      `# ${idea.name}`,
      '...(detailed plan in markdown)...',
      'PLAN_END',
    ].join('\n');
  }

  parseIdeas(output: string): InventifyIdea[] {
    const ideas: InventifyIdea[] = [];

    for (let i = 1; i <= 5; i++) {
      const nameMatch = output.match(
        new RegExp(`IDEA_${i}_NAME:\\s*([^\\n]+)`),
      );
      const taglineMatch = output.match(
        new RegExp(`IDEA_${i}_TAGLINE:\\s*([^\\n]+)`),
      );
      const descMatch = output.match(
        new RegExp(`IDEA_${i}_DESCRIPTION:\\s*([^\\n]+)`),
      );

      if (nameMatch && taglineMatch && descMatch) {
        ideas.push({
          name: nameMatch[1]!.trim(),
          tagline: taglineMatch[1]!.trim(),
          description: descMatch[1]!.trim(),
        });
      }
    }

    if (ideas.length === 0) {
      throw new Error('Could not parse any ideas from agent output');
    }

    return ideas;
  }

  parseAgentOutput(output: string): ParsedOutput {
    const nameMatch = output.match(/PROJECT_NAME:\s*([a-z0-9-]+)/i);

    if (!nameMatch) {
      throw new Error('Could not parse project name from agent output');
    }

    const planMatch = output.match(/PLAN_START\n([\s\S]*?)\nPLAN_END/);

    if (!planMatch) {
      throw new Error('Could not parse plan from agent output');
    }

    return {
      name: nameMatch[1]!.toLowerCase(),
      plan: planMatch[1]!.trim(),
    };
  }
}

function buildRalphTaskDescription(plan: string): string {
  return `Implement the project according to the following plan:\n\n${plan}`;
}
