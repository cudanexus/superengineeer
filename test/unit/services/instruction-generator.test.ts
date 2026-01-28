import {
  DefaultInstructionGenerator,
  InstructionGeneratorConfig,
  MilestoneInstructionConfig,
  createItemRefFromContext,
  ItemWithContext,
} from '../../../src/services/instruction-generator';
import { ParsedRoadmap, RoadmapPhase, RoadmapMilestone, RoadmapTask } from '../../../src/services/roadmap';
import { MilestoneItemRef } from '../../../src/repositories/project';

describe('DefaultInstructionGenerator', () => {
  let generator: DefaultInstructionGenerator;

  beforeEach(() => {
    generator = new DefaultInstructionGenerator();
  });

  // Helper to create a sample roadmap
  function createRoadmap(phases: Partial<RoadmapPhase>[] = []): ParsedRoadmap {
    return {
      phases: phases.map((p, i) => ({
        id: p.id ?? `phase-${i}`,
        title: p.title ?? `Phase ${i + 1}`,
        milestones: p.milestones ?? [],
      })),
      currentPhase: null,
      currentMilestone: null,
      overallProgress: 0,
    };
  }

  function createMilestone(overrides: Partial<RoadmapMilestone> = {}): RoadmapMilestone {
    const tasks = overrides.tasks ?? [{ title: 'Task 1', completed: false }];
    return {
      id: overrides.id ?? 'milestone-1',
      title: overrides.title ?? 'Milestone 1',
      tasks,
      completedCount: overrides.completedCount ?? tasks.filter((t) => t.completed).length,
      totalCount: overrides.totalCount ?? tasks.length,
    };
  }

  function createTask(title: string, completed = false): RoadmapTask {
    return { title, completed };
  }

  describe('generate', () => {
    it('should generate completion instructions when all milestones are complete', () => {
      const roadmap = createRoadmap([
        {
          milestones: [
            createMilestone({
              tasks: [createTask('Task 1', true)],
              completedCount: 1,
              totalCount: 1,
            }),
          ],
        },
      ]);

      const result = generator.generate(roadmap, 'Test Project');

      expect(result).toContain('All milestones in the current roadmap are complete!');
      expect(result).toContain('Test Project');
    });

    it('should generate milestone instructions for first incomplete milestone', () => {
      const roadmap = createRoadmap([
        {
          title: 'Phase 1: Setup',
          milestones: [
            createMilestone({
              title: 'Setup Environment',
              tasks: [createTask('Install dependencies', false), createTask('Configure linter', false)],
              completedCount: 0,
              totalCount: 2,
            }),
          ],
        },
      ]);

      const result = generator.generate(roadmap, 'My App');

      expect(result).toContain('My App');
      expect(result).toContain('Phase 1: Setup');
      expect(result).toContain('Setup Environment');
      expect(result).toContain('- Install dependencies');
      expect(result).toContain('- Configure linter');
    });

    it('should skip completed milestones', () => {
      const roadmap = createRoadmap([
        {
          title: 'Phase 1',
          milestones: [
            createMilestone({
              title: 'Completed Milestone',
              tasks: [createTask('Done task', true)],
              completedCount: 1,
              totalCount: 1,
            }),
            createMilestone({
              title: 'Pending Milestone',
              tasks: [createTask('Pending task', false)],
              completedCount: 0,
              totalCount: 1,
            }),
          ],
        },
      ]);

      const result = generator.generate(roadmap, 'Project');

      expect(result).toContain('Pending Milestone');
      expect(result).not.toContain('Completed Milestone');
    });

    it('should only include pending tasks in instructions', () => {
      const roadmap = createRoadmap([
        {
          milestones: [
            createMilestone({
              tasks: [
                createTask('Done task', true),
                createTask('Pending task 1', false),
                createTask('Pending task 2', false),
              ],
              completedCount: 1,
              totalCount: 3,
            }),
          ],
        },
      ]);

      const result = generator.generate(roadmap, 'Project');

      expect(result).not.toContain('Done task');
      expect(result).toContain('- Pending task 1');
      expect(result).toContain('- Pending task 2');
    });

    it('should generate completion instructions for empty roadmap', () => {
      const roadmap = createRoadmap([]);

      const result = generator.generate(roadmap, 'Empty Project');

      expect(result).toContain('All milestones in the current roadmap are complete!');
    });
  });

  describe('generateForItem', () => {
    it('should interpolate all variables in template', () => {
      const template = `Project: \${var:project-name}
Phase: \${var:phase-title}
Milestone: \${var:milestone-title}
Task: \${var:milestone-item}`;

      const config: InstructionGeneratorConfig = {
        projectName: 'MyProject',
        phaseTitle: 'Phase 1',
        milestoneTitle: 'Milestone 1',
        milestoneItem: 'Task 1',
      };

      const result = generator.generateForItem(template, config);

      expect(result).toBe(`Project: MyProject
Phase: Phase 1
Milestone: Milestone 1
Task: Task 1`);
    });

    it('should replace multiple occurrences of same variable', () => {
      const template = `\${var:project-name} - \${var:project-name}`;

      const config: InstructionGeneratorConfig = {
        projectName: 'Test',
        phaseTitle: '',
        milestoneTitle: '',
        milestoneItem: '',
      };

      const result = generator.generateForItem(template, config);

      expect(result).toBe('Test - Test');
    });

    it('should leave unmatched variables as-is', () => {
      const template = `\${var:project-name} and \${var:unknown}`;

      const config: InstructionGeneratorConfig = {
        projectName: 'Project',
        phaseTitle: '',
        milestoneTitle: '',
        milestoneItem: '',
      };

      const result = generator.generateForItem(template, config);

      expect(result).toBe('Project and ${var:unknown}');
    });

    it('should handle empty template', () => {
      const config: InstructionGeneratorConfig = {
        projectName: 'Project',
        phaseTitle: 'Phase',
        milestoneTitle: 'Milestone',
        milestoneItem: 'Item',
      };

      const result = generator.generateForItem('', config);

      expect(result).toBe('');
    });
  });

  describe('generateForMilestone', () => {
    it('should interpolate variables with task list', () => {
      const template = `Working on \${var:project-name}
Phase: \${var:phase-title}
Milestone: \${var:milestone-title}

Tasks:
\${var:milestone-item}`;

      const config: MilestoneInstructionConfig = {
        projectName: 'MyApp',
        phaseTitle: 'Setup',
        milestoneTitle: 'Environment',
        pendingTasks: ['Install Node', 'Setup ESLint', 'Configure TypeScript'],
      };

      const result = generator.generateForMilestone(template, config);

      expect(result).toContain('Working on MyApp');
      expect(result).toContain('Phase: Setup');
      expect(result).toContain('Milestone: Environment');
      expect(result).toContain('- Install Node');
      expect(result).toContain('- Setup ESLint');
      expect(result).toContain('- Configure TypeScript');
    });

    it('should handle empty task list', () => {
      const template = `Tasks:\n\${var:milestone-item}`;

      const config: MilestoneInstructionConfig = {
        projectName: 'Project',
        phaseTitle: 'Phase',
        milestoneTitle: 'Milestone',
        pendingTasks: [],
      };

      const result = generator.generateForMilestone(template, config);

      expect(result).toBe('Tasks:\n');
    });

    it('should handle single task', () => {
      const template = `\${var:milestone-item}`;

      const config: MilestoneInstructionConfig = {
        projectName: 'Project',
        phaseTitle: 'Phase',
        milestoneTitle: 'Milestone',
        pendingTasks: ['Single task'],
      };

      const result = generator.generateForMilestone(template, config);

      expect(result).toBe('- Single task');
    });
  });

  describe('findItemByRef', () => {
    it('should find item by exact reference', () => {
      const phase: RoadmapPhase = {
        id: 'phase-1',
        title: 'Phase 1',
        milestones: [
          createMilestone({
            id: 'milestone-1',
            tasks: [createTask('Task A'), createTask('Task B'), createTask('Task C')],
          }),
        ],
      };
      const roadmap = createRoadmap([phase]);

      const ref: MilestoneItemRef = {
        phaseId: 'phase-1',
        milestoneId: 'milestone-1',
        itemIndex: 1,
        taskTitle: 'Task B',
      };

      const result = generator.findItemByRef(roadmap, ref);

      expect(result).not.toBeNull();
      expect(result?.task.title).toBe('Task B');
      expect(result?.itemIndex).toBe(1);
      expect(result?.phase.id).toBe('phase-1');
      expect(result?.milestone.id).toBe('milestone-1');
    });

    it('should return null for non-existent phase', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          milestones: [createMilestone({ id: 'milestone-1' })],
        },
      ]);

      const ref: MilestoneItemRef = {
        phaseId: 'non-existent',
        milestoneId: 'milestone-1',
        itemIndex: 0,
        taskTitle: 'Task',
      };

      const result = generator.findItemByRef(roadmap, ref);

      expect(result).toBeNull();
    });

    it('should return null for non-existent milestone', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          milestones: [createMilestone({ id: 'milestone-1' })],
        },
      ]);

      const ref: MilestoneItemRef = {
        phaseId: 'phase-1',
        milestoneId: 'non-existent',
        itemIndex: 0,
        taskTitle: 'Task',
      };

      const result = generator.findItemByRef(roadmap, ref);

      expect(result).toBeNull();
    });

    it('should return null for out-of-bounds item index', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          milestones: [
            createMilestone({
              id: 'milestone-1',
              tasks: [createTask('Task 1')],
            }),
          ],
        },
      ]);

      const ref: MilestoneItemRef = {
        phaseId: 'phase-1',
        milestoneId: 'milestone-1',
        itemIndex: 5,
        taskTitle: 'Task',
      };

      const result = generator.findItemByRef(roadmap, ref);

      expect(result).toBeNull();
    });

    it('should search across multiple phases and milestones', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          milestones: [createMilestone({ id: 'milestone-1', tasks: [createTask('Task 1')] })],
        },
        {
          id: 'phase-2',
          milestones: [
            createMilestone({ id: 'milestone-2', tasks: [createTask('Task 2')] }),
            createMilestone({ id: 'milestone-3', tasks: [createTask('Task 3'), createTask('Target Task')] }),
          ],
        },
      ]);

      const ref: MilestoneItemRef = {
        phaseId: 'phase-2',
        milestoneId: 'milestone-3',
        itemIndex: 1,
        taskTitle: 'Target Task',
      };

      const result = generator.findItemByRef(roadmap, ref);

      expect(result).not.toBeNull();
      expect(result?.task.title).toBe('Target Task');
    });
  });

  describe('findFirstIncompleteItem', () => {
    it('should find first incomplete task', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          milestones: [
            createMilestone({
              id: 'milestone-1',
              tasks: [createTask('Complete', true), createTask('Incomplete'), createTask('Also incomplete')],
            }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteItem(roadmap);

      expect(result).not.toBeNull();
      expect(result?.task.title).toBe('Incomplete');
      expect(result?.itemIndex).toBe(1);
    });

    it('should return null when all tasks are complete', () => {
      const roadmap = createRoadmap([
        {
          milestones: [
            createMilestone({
              tasks: [createTask('Done 1', true), createTask('Done 2', true)],
            }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteItem(roadmap);

      expect(result).toBeNull();
    });

    it('should return null for empty roadmap', () => {
      const roadmap = createRoadmap([]);

      const result = generator.findFirstIncompleteItem(roadmap);

      expect(result).toBeNull();
    });

    it('should search in order across phases and milestones', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          milestones: [
            createMilestone({
              id: 'milestone-1',
              tasks: [createTask('Done', true)],
            }),
          ],
        },
        {
          id: 'phase-2',
          milestones: [
            createMilestone({
              id: 'milestone-2',
              tasks: [createTask('First incomplete')],
            }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteItem(roadmap);

      expect(result).not.toBeNull();
      expect(result?.phase.id).toBe('phase-2');
      expect(result?.milestone.id).toBe('milestone-2');
      expect(result?.task.title).toBe('First incomplete');
    });

    it('should handle milestone with empty tasks array', () => {
      const roadmap = createRoadmap([
        {
          milestones: [
            createMilestone({ tasks: [] }),
            createMilestone({ tasks: [createTask('Found it')] }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteItem(roadmap);

      expect(result?.task.title).toBe('Found it');
    });
  });

  describe('findFirstIncompleteMilestone', () => {
    it('should find first milestone with pending tasks', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          milestones: [
            createMilestone({
              id: 'milestone-1',
              title: 'Incomplete Milestone',
              tasks: [createTask('Pending 1'), createTask('Pending 2')],
            }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteMilestone(roadmap);

      expect(result).not.toBeNull();
      expect(result?.milestone.title).toBe('Incomplete Milestone');
      expect(result?.pendingTasks).toHaveLength(2);
      expect(result?.pendingTasks[0]?.title).toBe('Pending 1');
    });

    it('should skip milestones with all completed tasks', () => {
      const roadmap = createRoadmap([
        {
          milestones: [
            createMilestone({
              id: 'complete',
              title: 'Complete',
              tasks: [createTask('Done', true)],
            }),
            createMilestone({
              id: 'incomplete',
              title: 'Incomplete',
              tasks: [createTask('Pending')],
            }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteMilestone(roadmap);

      expect(result?.milestone.title).toBe('Incomplete');
    });

    it('should return null when all milestones are complete', () => {
      const roadmap = createRoadmap([
        {
          milestones: [
            createMilestone({ tasks: [createTask('Done', true)] }),
            createMilestone({ tasks: [createTask('Also done', true)] }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteMilestone(roadmap);

      expect(result).toBeNull();
    });

    it('should only include pending tasks in result', () => {
      const roadmap = createRoadmap([
        {
          milestones: [
            createMilestone({
              tasks: [createTask('Done', true), createTask('Pending 1'), createTask('Pending 2')],
            }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteMilestone(roadmap);

      expect(result?.pendingTasks).toHaveLength(2);
      expect(result?.pendingTasks.every((t) => !t.completed)).toBe(true);
    });

    it('should return null for milestone with empty tasks', () => {
      const roadmap = createRoadmap([
        {
          milestones: [createMilestone({ tasks: [] })],
        },
      ]);

      const result = generator.findFirstIncompleteMilestone(roadmap);

      expect(result).toBeNull();
    });

    it('should include phase context in result', () => {
      const roadmap = createRoadmap([
        {
          id: 'phase-1',
          title: 'Setup Phase',
          milestones: [
            createMilestone({
              tasks: [createTask('Task')],
            }),
          ],
        },
      ]);

      const result = generator.findFirstIncompleteMilestone(roadmap);

      expect(result?.phase.id).toBe('phase-1');
      expect(result?.phase.title).toBe('Setup Phase');
    });
  });
});

describe('createItemRefFromContext', () => {
  it('should create reference from item context', () => {
    const context: ItemWithContext = {
      phase: { id: 'phase-1', title: 'Phase 1', milestones: [] },
      milestone: {
        id: 'milestone-1',
        title: 'Milestone 1',
        tasks: [],
        completedCount: 0,
        totalCount: 0,
      },
      task: { title: 'Task Title', completed: false },
      itemIndex: 2,
    };

    const ref = createItemRefFromContext(context);

    expect(ref).toEqual({
      phaseId: 'phase-1',
      milestoneId: 'milestone-1',
      itemIndex: 2,
      taskTitle: 'Task Title',
    });
  });

  it('should preserve exact values without modification', () => {
    const context: ItemWithContext = {
      phase: { id: 'special-id-123', title: 'Special Phase', milestones: [] },
      milestone: {
        id: 'ms-456',
        title: 'Special Milestone',
        tasks: [],
        completedCount: 0,
        totalCount: 0,
      },
      task: { title: 'Task with special chars: <>&"\'', completed: true },
      itemIndex: 0,
    };

    const ref = createItemRefFromContext(context);

    expect(ref.phaseId).toBe('special-id-123');
    expect(ref.milestoneId).toBe('ms-456');
    expect(ref.taskTitle).toBe('Task with special chars: <>&"\'');
  });
});
