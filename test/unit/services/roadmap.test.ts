import {
  MarkdownRoadmapParser,
  MarkdownRoadmapEditor,
  RoadmapParser,
} from '../../../src/services/roadmap';

describe('MarkdownRoadmapParser', () => {
  let parser: RoadmapParser;

  beforeEach(() => {
    parser = new MarkdownRoadmapParser();
  });

  describe('parse', () => {
    it('should parse a simple roadmap', () => {
      const content = `# Roadmap

## Phase 1: Setup

### Milestone 1.1: Initial Setup
- [x] Task 1
- [ ] Task 2

### Milestone 1.2: Configuration
- [ ] Task 3

## Phase 2: Development

### Milestone 2.1: Core Features
- [ ] Task 4
- [ ] Task 5
`;

      const result = parser.parse(content);

      expect(result.phases).toHaveLength(2);
      expect(result.phases[0]!.id).toBe('phase-1');
      expect(result.phases[0]!.title).toBe('Phase 1: Setup');
      expect(result.phases[0]!.milestones).toHaveLength(2);
      expect(result.phases[0]!.milestones[0]!.tasks).toHaveLength(2);
      expect(result.phases[0]!.milestones[0]!.completedCount).toBe(1);
      expect(result.overallProgress).toBe(20); // 1 of 5 tasks completed
    });

    it('should handle empty content', () => {
      const result = parser.parse('');

      expect(result.phases).toHaveLength(0);
      expect(result.overallProgress).toBe(0);
    });
  });
});

describe('MarkdownRoadmapEditor', () => {
  let parser: RoadmapParser;
  let editor: MarkdownRoadmapEditor;

  beforeEach(() => {
    parser = new MarkdownRoadmapParser();
    editor = new MarkdownRoadmapEditor(parser);
  });

  const sampleRoadmap = `# Project Roadmap

## Phase 1: Foundation

### Milestone 1.1: Setup
- [x] Initialize project
- [ ] Configure linting
- [ ] Setup testing

### Milestone 1.2: Core Structure
- [ ] Create folder structure
- [ ] Setup routing

## Phase 2: Features

### Milestone 2.1: User Management
- [ ] User registration
- [ ] User login
- [ ] User profile

## Phase 3: Polish

### Milestone 3.1: Cleanup
- [ ] Code review
- [ ] Documentation
`;

  describe('deleteTask', () => {
    it('should delete a specific task by index', () => {
      const result = editor.deleteTask(sampleRoadmap, {
        phaseId: 'phase-1',
        milestoneId: 'milestone-1.1',
        taskIndex: 1,
      });

      expect(result).not.toContain('Configure linting');
      expect(result).toContain('Initialize project');
      expect(result).toContain('Setup testing');
    });

    it('should throw error for invalid phase', () => {
      expect(() =>
        editor.deleteTask(sampleRoadmap, {
          phaseId: 'phase-99',
          milestoneId: 'milestone-1.1',
          taskIndex: 0,
        })
      ).toThrow('Phase not found: phase-99');
    });

    it('should throw error for invalid milestone', () => {
      expect(() =>
        editor.deleteTask(sampleRoadmap, {
          phaseId: 'phase-1',
          milestoneId: 'milestone-99.99',
          taskIndex: 0,
        })
      ).toThrow('Milestone not found: milestone-99.99');
    });

    it('should throw error for invalid task index', () => {
      expect(() =>
        editor.deleteTask(sampleRoadmap, {
          phaseId: 'phase-1',
          milestoneId: 'milestone-1.1',
          taskIndex: 99,
        })
      ).toThrow('Invalid task index: 99');
    });
  });

  describe('deleteMilestone', () => {
    it('should delete an entire milestone with all its tasks', () => {
      const result = editor.deleteMilestone(sampleRoadmap, {
        phaseId: 'phase-1',
        milestoneId: 'milestone-1.1',
      });

      expect(result).not.toContain('Milestone 1.1: Setup');
      expect(result).not.toContain('Initialize project');
      expect(result).not.toContain('Configure linting');
      expect(result).not.toContain('Setup testing');
      expect(result).toContain('Milestone 1.2: Core Structure');
      expect(result).toContain('Phase 1: Foundation');
    });

    it('should delete a milestone without affecting other phases', () => {
      const result = editor.deleteMilestone(sampleRoadmap, {
        phaseId: 'phase-2',
        milestoneId: 'milestone-2.1',
      });

      expect(result).not.toContain('Milestone 2.1: User Management');
      expect(result).not.toContain('User registration');
      expect(result).toContain('Phase 1: Foundation');
      expect(result).toContain('Milestone 1.1: Setup');
      expect(result).toContain('Phase 3: Polish');
    });

    it('should throw error for invalid phase', () => {
      expect(() =>
        editor.deleteMilestone(sampleRoadmap, {
          phaseId: 'phase-99',
          milestoneId: 'milestone-1.1',
        })
      ).toThrow('Phase not found: phase-99');
    });

    it('should throw error for invalid milestone', () => {
      expect(() =>
        editor.deleteMilestone(sampleRoadmap, {
          phaseId: 'phase-1',
          milestoneId: 'milestone-99.99',
        })
      ).toThrow('Milestone not found: milestone-99.99');
    });
  });

  describe('deletePhase', () => {
    it('should delete an entire phase with all milestones and tasks', () => {
      const result = editor.deletePhase(sampleRoadmap, {
        phaseId: 'phase-1',
      });

      expect(result).not.toContain('Phase 1: Foundation');
      expect(result).not.toContain('Milestone 1.1: Setup');
      expect(result).not.toContain('Milestone 1.2: Core Structure');
      expect(result).not.toContain('Initialize project');
      expect(result).toContain('Phase 2: Features');
      expect(result).toContain('Phase 3: Polish');
    });

    it('should delete a middle phase without affecting others', () => {
      const result = editor.deletePhase(sampleRoadmap, {
        phaseId: 'phase-2',
      });

      expect(result).not.toContain('Phase 2: Features');
      expect(result).not.toContain('Milestone 2.1: User Management');
      expect(result).not.toContain('User registration');
      expect(result).toContain('Phase 1: Foundation');
      expect(result).toContain('Phase 3: Polish');
    });

    it('should delete the last phase', () => {
      const result = editor.deletePhase(sampleRoadmap, {
        phaseId: 'phase-3',
      });

      expect(result).not.toContain('Phase 3: Polish');
      expect(result).not.toContain('Milestone 3.1: Cleanup');
      expect(result).toContain('Phase 1: Foundation');
      expect(result).toContain('Phase 2: Features');
    });

    it('should throw error for invalid phase', () => {
      expect(() =>
        editor.deletePhase(sampleRoadmap, {
          phaseId: 'phase-99',
        })
      ).toThrow('Phase not found: phase-99');
    });

    it('should handle deleting all phases', () => {
      let result = editor.deletePhase(sampleRoadmap, { phaseId: 'phase-1' });
      result = editor.deletePhase(result, { phaseId: 'phase-2' });
      result = editor.deletePhase(result, { phaseId: 'phase-3' });

      expect(result.trim()).toBe('# Project Roadmap');
    });
  });
});
