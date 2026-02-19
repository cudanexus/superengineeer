import fs from 'fs';
import path from 'path';
import { generateUUID } from '../utils/uuid';
import { Logger } from '../utils/logger';
import { AgentManager } from '../agents/agent-manager';
import { AgentMessage, AgentStatus } from '../agents/types';
import { ProjectService } from './project';
import { RalphLoopService, RalphLoopConfig } from './ralph-loop/types';
import { SettingsRepository } from '../repositories/settings';
import {
  InventifyService,
  InventifyRequest,
  InventifyResult,
  InventifyIdea,
  InventifyNameSuggestion,
  InventifyBuildResult,
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
  private sessionOneOffId: string | null = null;
  private collectedOutput = '';
  private pendingIdeas: InventifyIdea[] | null = null;
  private pendingState: PendingState | null = null;
  private pendingNames: InventifyNameSuggestion | null = null;
  private completedResult: InventifyBuildResult | null = null;

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

    await this.stopSessionAgent();

    this.pendingIdeas = null;
    this.pendingState = null;
    this.completedResult = null;

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
      request.languages,
      request.technologies,
      request.customPrompt,
    );

    const oneOffId = await this.agentManager.startOneOffAgent({
      projectId: placeholderProjectId,
      message: prompt,
      permissionMode: 'acceptEdits',
      label: 'Inventify Brainstorm',
    });

    this.activeOneOffId = oneOffId;
    this.sessionOneOffId = oneOffId;
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

  getBuildResult(): InventifyBuildResult | null {
    return this.completedResult;
  }

  getIdeas(): InventifyIdea[] | null {
    return this.pendingIdeas;
  }

  getNameSuggestions(): InventifyNameSuggestion | null {
    return this.pendingNames;
  }

  suggestNames(index: number): Promise<InventifyResult> {
    if (!this.pendingIdeas || !this.pendingState) {
      return Promise.reject(new Error('No pending ideas to select from'));
    }

    if (index < 0 || index >= this.pendingIdeas.length) {
      return Promise.reject(
        new Error(
          `Invalid idea index: ${index}. Must be 0-${this.pendingIdeas.length - 1}`,
        ),
      );
    }

    if (this.activeOneOffId) {
      return Promise.reject(new Error('Inventify is already running'));
    }

    if (!this.sessionOneOffId) {
      return Promise.reject(new Error('No active session agent'));
    }

    const idea = this.pendingIdeas[index]!;
    const { placeholderProjectId } = this.pendingState;
    const prompt = this.buildNameSuggestionPrompt(idea);

    this.agentManager.sendOneOffInput(this.sessionOneOffId, prompt);

    this.activeOneOffId = this.sessionOneOffId;
    this.collectedOutput = '';
    this.pendingNames = null;

    this.setupNameListeners(this.sessionOneOffId, index);

    return Promise.resolve({
      oneOffId: this.sessionOneOffId,
      placeholderProjectId,
    });
  }

  async cancel(): Promise<void> {
    await this.stopSessionAgent();

    this.activeOneOffId = null;
    this.collectedOutput = '';
    this.pendingIdeas = null;
    this.pendingState = null;
    this.pendingNames = null;
    this.completedResult = null;
  }

  async selectIdea(
    index: number,
    projectName: string,
  ): Promise<InventifyResult> {
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

    await this.stopSessionAgent();

    const idea = this.pendingIdeas[index]!;
    const { placeholderProjectId, placeholderPath, request } =
      this.pendingState;

    const newProjectId = await this.renameAndUpdateProject(
      placeholderProjectId,
      placeholderPath,
      request.inventifyFolder,
      projectName,
    );

    const prompt = this.buildPlanPrompt(idea, projectName);

    this.pendingIdeas = null;
    this.pendingState = null;
    this.pendingNames = null;

    return { placeholderProjectId, newProjectId, prompt };
  }

  async completeBuild(
    projectId: string,
    projectPath: string,
  ): Promise<void> {
    const planPath = path.join(projectPath, 'doc', 'plan.md');

    const plan = await fs.promises.readFile(planPath, 'utf-8');

    await this.startRalphLoop(projectId, plan);

    this.completedResult = {
      newProjectId: projectId,
      projectName: path.basename(projectPath),
    };

    this.logger.info('Inventify build completed', {
      projectId,
      projectName: path.basename(projectPath),
    });
  }

  private async stopSessionAgent(): Promise<void> {
    const agentId = this.sessionOneOffId || this.activeOneOffId;

    if (agentId) {
      await this.agentManager.stopOneOffAgent(agentId);
    }

    this.sessionOneOffId = null;
  }

  private setupBrainstormListeners(oneOffId: string): void {
    const removeAllListeners = (): void => {
      this.agentManager.off('oneOffMessage', messageHandler);
      this.agentManager.off('oneOffStatus', statusHandler);
      this.agentManager.off('oneOffWaiting', waitingHandler);
    };

    const messageHandler = (
      msgOneOffId: string,
      message: AgentMessage,
    ): void => {
      if (msgOneOffId !== oneOffId) return;

      if (message.type === 'stdout' || message.type === 'result') {
        this.collectedOutput += message.content;
      }
    };

    const statusHandler = (
      statusOneOffId: string,
      status: AgentStatus,
    ): void => {
      if (statusOneOffId !== oneOffId) return;

      if (status !== 'stopped' && status !== 'error') return;

      removeAllListeners();

      const output = this.collectedOutput;
      this.activeOneOffId = null;
      this.collectedOutput = '';

      if (status === 'stopped') {
        this.handleBrainstormCompletion(output);
      }
    };

    const waitingHandler = (
      waitOneOffId: string,
      isWaiting: boolean,
    ): void => {
      if (waitOneOffId !== oneOffId || !isWaiting) return;

      removeAllListeners();

      const output = this.collectedOutput;
      this.activeOneOffId = null;
      this.collectedOutput = '';

      this.handleBrainstormCompletion(output);
    };

    this.agentManager.on('oneOffMessage', messageHandler);
    this.agentManager.on('oneOffStatus', statusHandler);
    this.agentManager.on('oneOffWaiting', waitingHandler);
  }

  private setupNameListeners(
    oneOffId: string,
    ideaIndex: number,
  ): void {
    const removeAllListeners = (): void => {
      this.agentManager.off('oneOffMessage', messageHandler);
      this.agentManager.off('oneOffStatus', statusHandler);
      this.agentManager.off('oneOffWaiting', waitingHandler);
    };

    const messageHandler = (
      msgOneOffId: string,
      message: AgentMessage,
    ): void => {
      if (msgOneOffId !== oneOffId) return;

      if (message.type === 'stdout' || message.type === 'result') {
        this.collectedOutput += message.content;
      }
    };

    const statusHandler = (
      statusOneOffId: string,
      status: AgentStatus,
    ): void => {
      if (statusOneOffId !== oneOffId) return;

      if (status !== 'stopped' && status !== 'error') return;

      removeAllListeners();

      const output = this.collectedOutput;
      this.activeOneOffId = null;
      this.collectedOutput = '';

      if (status === 'stopped') {
        this.handleNameCompletion(output, ideaIndex);
      }
    };

    const waitingHandler = (
      waitOneOffId: string,
      isWaiting: boolean,
    ): void => {
      if (waitOneOffId !== oneOffId || !isWaiting) return;

      removeAllListeners();

      const output = this.collectedOutput;
      this.activeOneOffId = null;
      this.collectedOutput = '';

      this.handleNameCompletion(output, ideaIndex);
    };

    this.agentManager.on('oneOffMessage', messageHandler);
    this.agentManager.on('oneOffStatus', statusHandler);
    this.agentManager.on('oneOffWaiting', waitingHandler);
  }

  private handleBrainstormCompletion(output: string): void {
    this.logger.info('Inventify brainstorm output', {
      outputLength: output.length,
      preview: output.substring(0, 500),
    });

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

  private handleNameCompletion(
    output: string,
    ideaIndex: number,
  ): void {
    this.logger.info('Inventify name suggestion output', {
      outputLength: output.length,
      preview: output.substring(0, 500),
    });

    try {
      const names = this.parseNames(output);
      this.pendingNames = { names, ideaIndex };

      this.logger.info('Inventify names suggested', {
        nameCount: names.length,
      });
    } catch (error) {
      this.logger.error('Failed to parse name suggestions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.pendingNames = null;
    }
  }

  private async renameAndUpdateProject(
    placeholderProjectId: string,
    placeholderPath: string,
    inventifyFolder: string,
    projectName: string,
  ): Promise<string> {
    const finalPath = path.join(inventifyFolder, projectName);

    await this.renameDirectory(placeholderPath, finalPath);

    const updatedProject = await this.projectService.updateProjectPath(
      placeholderProjectId,
      projectName,
      finalPath,
    );

    return updatedProject?.id ?? placeholderProjectId;
  }

  private async renameDirectory(
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    if (oldPath === newPath) return;

    await fs.promises.rename(oldPath, newPath);
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
    languages: string[],
    technologies: string[],
    customPrompt: string,
  ): string {
    const types = projectTypes.join(', ');
    const themeList = themes.join(', ');

    const lines = [
      'You are a creative software project inventor.',
      '',
      `**Project Types**: ${types}`,
      `**Themes**: ${themeList}`,
    ];

    if (languages.length > 0) {
      lines.push(`**Languages**: ${languages.join(', ')}`);
    }

    if (technologies.length > 0) {
      lines.push(`**Technologies/Frameworks**: ${technologies.join(', ')}`);
    }

    lines.push(
      '',
      'Invent exactly 5 creative, practical project ideas.',
      'Make each idea distinct and interesting.',
      'Cover different approaches to the given types and themes.',
    );

    if (customPrompt.trim()) {
      lines.push('', `**Additional Instructions**: ${customPrompt.trim()}`);
    }

    lines.push(
      '',
      'You MUST output ONLY a JSON array with exactly 5 objects.',
      'Each object must have: name (lowercase, hyphens, numbers only), tagline (catchy one-liner), description (2-3 sentences).',
      '',
      'Output NOTHING before or after the JSON. Example:',
      '',
      '```json',
      '[',
      '  {"name": "pixel-garden", "tagline": "Grow your own pixel forest", "description": "A virtual garden app."},',
      '  {"name": "code-quest", "tagline": "Learn coding through adventure", "description": "An RPG to teach programming."}',
      ']',
      '```',
    );

    return lines.join('\n');
  }

  buildNameSuggestionPrompt(idea: InventifyIdea): string {
    return [
      'You are a creative software project naming expert.',
      '',
      `**Project Concept**: ${idea.name}`,
      `**Tagline**: ${idea.tagline}`,
      `**Description**: ${idea.description}`,
      '',
      'Suggest exactly 5 creative project names.',
      'Names must be lowercase, use hyphens, and contain only letters, numbers, and hyphens.',
      'Names should be memorable, concise (1-3 words), and relate to the concept.',
      '',
      'You MUST output ONLY a JSON array of 5 strings.',
      'Output NOTHING before or after the JSON. Example:',
      '',
      '```json',
      '["pixel-garden", "green-bits", "flora-sim", "byte-bloom", "digiplant"]',
      '```',
    ].join('\n');
  }

  buildPlanPrompt(
    idea: InventifyIdea,
    projectName: string,
  ): string {
    return [
      'You are a software architect creating a detailed implementation plan.',
      '',
      `**Project Name**: ${projectName}`,
      `**Concept**: ${idea.name}`,
      `**Tagline**: ${idea.tagline}`,
      `**Description**: ${idea.description}`,
      '',
      'Create a detailed implementation plan and write it to `doc/plan.md`.',
      '',
      'The plan must cover:',
      '- Overview and goals',
      '- Technology stack',
      '- Core features (prioritized)',
      '- Architecture and file structure',
      '- Implementation phases with tasks',
    ].join('\n');
  }

  parseIdeas(output: string): InventifyIdea[] {
    const jsonArray = extractJsonArray(output);

    if (!jsonArray) {
      throw new Error('Could not parse any ideas from agent output');
    }

    const ideas: InventifyIdea[] = [];

    for (const item of jsonArray) {
      if (isValidIdea(item)) {
        ideas.push({
          name: String(item.name).trim(),
          tagline: String(item.tagline).trim(),
          description: String(item.description).trim(),
        });
      }
    }

    if (ideas.length === 0) {
      throw new Error('Could not parse any ideas from agent output');
    }

    return ideas;
  }

  parseNames(output: string): string[] {
    const jsonArray = extractJsonArray(output);

    if (!jsonArray) {
      throw new Error('Could not parse name suggestions from agent output');
    }

    const names = jsonArray
      .filter((item): item is string => typeof item === 'string')
      .map((name) => name.trim().toLowerCase());

    if (names.length === 0) {
      throw new Error('Could not parse name suggestions from agent output');
    }

    return names;
  }

  parsePlan(output: string): string {
    const planMatch = output.match(/PLAN_START\n([\s\S]*?)\nPLAN_END/);

    if (!planMatch) {
      throw new Error('Could not parse plan from agent output');
    }

    return planMatch[1]!.trim();
  }

  parseAgentOutput(output: string): ParsedOutput {
    const nameMatch = output.match(/PROJECT_NAME:\s*([a-z0-9-]+)/i);

    if (!nameMatch) {
      throw new Error('Could not parse project name from agent output');
    }

    const plan = this.parsePlan(output);

    return {
      name: nameMatch[1]!.toLowerCase(),
      plan,
    };
  }
}

function buildRalphTaskDescription(plan: string): string {
  return `Implement the project according to the following plan:\n\n${plan}`;
}

function extractJsonArray(output: string): unknown[] | null {
  // Try to find a JSON array in the output (may be wrapped in ```json fences)
  const fencedMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const candidate = fencedMatch ? fencedMatch[1]!.trim() : output.trim();

  // Find the first [ and last ] to extract the array
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(candidate.substring(start, end + 1));

    if (Array.isArray(parsed)) return parsed as unknown[];
  } catch {
    // JSON parse failed
  }

  return null;
}

function isValidIdea(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return false;

  const obj = item as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.tagline === 'string' &&
    typeof obj.description === 'string'
  );
}
