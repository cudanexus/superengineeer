import { ParsedRoadmap, RoadmapMilestone, RoadmapPhase, RoadmapTask } from './roadmap';
import { MilestoneItemRef } from '../repositories/project';

export interface InstructionGeneratorConfig {
  projectName: string;
  phaseTitle: string;
  milestoneTitle: string;
  milestoneItem: string;
}

export interface MilestoneInstructionConfig {
  projectName: string;
  phaseTitle: string;
  milestoneTitle: string;
  pendingTasks: string[];
}

export interface MilestoneWithContext {
  phase: RoadmapPhase;
  milestone: RoadmapMilestone;
  pendingTasks: RoadmapTask[];
}

export interface InstructionGenerator {
  generate(roadmap: ParsedRoadmap, projectName: string): string;
  generateForItem(template: string, config: InstructionGeneratorConfig): string;
  generateForMilestone(template: string, config: MilestoneInstructionConfig): string;
  findItemByRef(roadmap: ParsedRoadmap, ref: MilestoneItemRef): ItemWithContext | null;
  findFirstIncompleteItem(roadmap: ParsedRoadmap): ItemWithContext | null;
  findFirstIncompleteMilestone(roadmap: ParsedRoadmap): MilestoneWithContext | null;
}

export interface ItemWithContext {
  phase: RoadmapPhase;
  milestone: RoadmapMilestone;
  task: RoadmapTask;
  itemIndex: number;
}

export class DefaultInstructionGenerator implements InstructionGenerator {
  generate(roadmap: ParsedRoadmap, projectName: string): string {
    const currentMilestone = this.findCurrentMilestone(roadmap);

    if (!currentMilestone) {
      return this.generateCompletionInstructions(projectName);
    }

    return this.generateMilestoneInstructions(currentMilestone, projectName);
  }

  generateForItem(template: string, config: InstructionGeneratorConfig): string {
    return this.interpolateTemplate(template, {
      'project-name': config.projectName,
      'phase-title': config.phaseTitle,
      'milestone-title': config.milestoneTitle,
      'milestone-item': config.milestoneItem,
    });
  }

  generateForMilestone(template: string, config: MilestoneInstructionConfig): string {
    const taskList = config.pendingTasks.map((t) => `- ${t}`).join('\n');

    return this.interpolateTemplate(template, {
      'project-name': config.projectName,
      'phase-title': config.phaseTitle,
      'milestone-title': config.milestoneTitle,
      'milestone-item': taskList,
    });
  }

  findItemByRef(roadmap: ParsedRoadmap, ref: MilestoneItemRef): ItemWithContext | null {
    for (const phase of roadmap.phases) {
      if (phase.id !== ref.phaseId) {
        continue;
      }

      for (const milestone of phase.milestones) {
        if (milestone.id !== ref.milestoneId) {
          continue;
        }

        const task = milestone.tasks[ref.itemIndex];

        if (task) {
          return {
            phase,
            milestone,
            task,
            itemIndex: ref.itemIndex,
          };
        }
      }
    }

    return null;
  }

  findFirstIncompleteItem(roadmap: ParsedRoadmap): ItemWithContext | null {
    for (const phase of roadmap.phases) {
      for (const milestone of phase.milestones) {
        for (let i = 0; i < milestone.tasks.length; i++) {
          const task = milestone.tasks[i];

          if (task && !task.completed) {
            return {
              phase,
              milestone,
              task,
              itemIndex: i,
            };
          }
        }
      }
    }

    return null;
  }

  findFirstIncompleteMilestone(roadmap: ParsedRoadmap): MilestoneWithContext | null {
    for (const phase of roadmap.phases) {
      for (const milestone of phase.milestones) {
        const pendingTasks = milestone.tasks.filter((t) => !t.completed);

        if (pendingTasks.length > 0) {
          return {
            phase,
            milestone,
            pendingTasks,
          };
        }
      }
    }

    return null;
  }

  private interpolateTemplate(template: string, variables: Record<string, string>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\$\\{var:${key}\\}`, 'g');
      result = result.replace(pattern, value);
    }

    return result;
  }

  private findCurrentMilestone(roadmap: ParsedRoadmap): MilestoneWithPhase | null {
    for (const phase of roadmap.phases) {
      for (const milestone of phase.milestones) {
        if (milestone.completedCount < milestone.totalCount) {
          return { milestone, phase };
        }
      }
    }

    return null;
  }

  private generateMilestoneInstructions(data: MilestoneWithPhase, projectName: string): string {
    const { milestone, phase } = data;
    const pendingTasks = milestone.tasks
      .filter((t) => !t.completed)
      .map((t) => `- ${t.title}`)
      .join('\n');

    return `You are working on the project "${projectName}".

Current Phase: ${phase.title}
Current Milestone: ${milestone.title}

Your task is to complete the following items:
${pendingTasks}

Instructions:
1. Work through each task systematically
2. Run tests after implementing each feature to ensure they pass
3. Update the ROADMAP.md to mark tasks as completed with [x] when done
4. Before finishing, save any important context to CLAUDE.md
5. Continue working until this milestone is complete with all tests passing

Do not stop until all tasks are completed and tests pass.`;
  }

  private generateCompletionInstructions(projectName: string): string {
    return `You are working on the project "${projectName}".

All milestones in the current roadmap are complete!

Please:
1. Run the full test suite to verify everything works
2. Review CLAUDE.md and update it with any new information
3. Check if there are any improvements or optimizations to make
4. Report the current status of the project`;
  }
}

interface MilestoneWithPhase {
  milestone: RoadmapMilestone;
  phase: RoadmapPhase;
}

export function createItemRefFromContext(context: ItemWithContext): MilestoneItemRef {
  return {
    phaseId: context.phase.id,
    milestoneId: context.milestone.id,
    itemIndex: context.itemIndex,
    taskTitle: context.task.title,
  };
}
