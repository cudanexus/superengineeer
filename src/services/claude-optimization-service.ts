import { Logger } from '../utils/logger';
import { AgentManager } from '../agents/agent-manager';
import path from 'path';

export interface OptimizationRequest {
  projectId: string;
  filePath: string;
  content: string;
  optimizationGoals?: string[];
}

export class ClaudeOptimizationService {
  private activeOptimizations: Map<string, string> = new Map(); // projectId -> oneOffId

  constructor(
    private readonly logger: Logger,
    private readonly agentManager: AgentManager
  ) {}

  async startOptimization(request: OptimizationRequest): Promise<string> {
    const { projectId, filePath, content, optimizationGoals = [] } = request;

    if (this.activeOptimizations.has(projectId)) {
      throw new Error('Optimization already in progress for this project');
    }

    const prompt = this.buildOptimizationPrompt(filePath, content, optimizationGoals);
    const fileName = path.basename(filePath);

    const oneOffId = await this.agentManager.startOneOffAgent({
      projectId,
      message: prompt,
      permissionMode: 'plan',
      label: `Optimize ${fileName}`,
    });

    this.activeOptimizations.set(projectId, oneOffId);

    // Listen for agent exit to clean up
    this.setupCleanupListener(projectId, oneOffId);

    return oneOffId;
  }

  private setupCleanupListener(projectId: string, oneOffId: string): void {
    const statusHandler = (_statusOneOffId: string, status: string): void => {
      if (_statusOneOffId !== oneOffId) return;

      if (status === 'stopped' || status === 'error') {
        this.activeOptimizations.delete(projectId);
        this.agentManager.off('oneOffStatus', statusHandler);
      }
    };

    this.agentManager.on('oneOffStatus', statusHandler);
  }

  private buildOptimizationPrompt(
    filePath: string,
    content: string,
    goals: string[]
  ): string {
    const fileName = path.basename(filePath);

    const defaultGoals = [
      'Remove any duplicated rules or instructions',
      'Consolidate similar rules into more concise versions',
      'Remove rules that contradict Claude\'s core values or capabilities',
      'Organize rules by category for better readability',
      'Remove vague or unclear instructions',
      'Preserve all unique and valuable content',
      'Maintain the original intent while improving clarity',
    ];

    const allGoals = [...defaultGoals, ...goals];

    return `Please optimize the ${fileName} file at "${filePath}".

Read the file, analyze it, then use the Edit tool to apply improvements directly to the file.

Optimization goals:
${allGoals.map((goal, i) => `${i + 1}. ${goal}`).join('\n')}

Current content for reference:
\`\`\`markdown
${content}
\`\`\`

Important:
- Use the Edit tool to make changes directly to the file
- Maintain the original formatting style and structure as much as possible
- When done, provide a brief summary of what you changed`;
  }

  isOptimizing(projectId: string): boolean {
    return this.activeOptimizations.has(projectId);
  }

  getActiveOptimizations(): string[] {
    return Array.from(this.activeOptimizations.keys());
  }
}
