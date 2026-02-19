import fs from 'fs';
import path from 'path';
import { AgentMessage } from '../../agents';
import { ConversationStats, OptimizationCheck, ClaudeFile } from './types';

export function computeConversationStats(
  messages: AgentMessage[],
  createdAt: string | null
): ConversationStats {
  const toolCallCount = messages.filter((m) => m.type === 'tool_use').length;
  const userMessageCount = messages.filter((m) => m.type === 'user').length;

  let durationMs: number | null = null;
  let startedAt: string | null = createdAt;

  if (messages.length > 0) {
    const firstMsg = messages[0]!;
    const lastMsg = messages[messages.length - 1]!;

    if (!startedAt && firstMsg.timestamp) {
      startedAt = firstMsg.timestamp;
    }

    if (startedAt && lastMsg.timestamp) {
      try {
        const start = new Date(startedAt).getTime();
        const end = new Date(lastMsg.timestamp).getTime();
        durationMs = end - start;
      } catch {
        // Invalid date format
      }
    }
  }

  return {
    messageCount: messages.length,
    toolCallCount,
    userMessageCount,
    durationMs,
    startedAt,
  };
}

export async function checkProjectClaudeMd(projectPath: string): Promise<OptimizationCheck> {
  const claudeFilePath = path.join(projectPath, 'CLAUDE.md');

  if (!fs.existsSync(claudeFilePath)) {
    return {
      id: 'project-claude-md',
      title: 'CLAUDE.md File (Project)',
      description: 'Project-specific instructions for Claude',
      filePath: claudeFilePath,
      status: 'info',
      statusMessage: 'File not found',
      action: 'create',
      actionLabel: 'Create CLAUDE.md',
    };
  }

  try {
    const content = await fs.promises.readFile(claudeFilePath, 'utf-8');
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

    if (nonEmptyLines.length < 5) {
      return {
        id: 'project-claude-md',
        title: 'CLAUDE.md File (Project)',
        description: 'Project-specific instructions for Claude',
        filePath: claudeFilePath,
        status: 'warning',
        statusMessage: 'File is too short (< 5 lines)',
        action: 'edit',
        actionLabel: 'Edit CLAUDE.md',
      };
    }

    const charCount = content.length;
    return {
      id: 'project-claude-md',
      title: 'CLAUDE.md File (Project)',
      description: 'Project-specific instructions for Claude',
      filePath: claudeFilePath,
      status: 'passed',
      statusMessage: `${lines.length} lines, ${charCount} characters`,
      action: 'claude-files',
      actionLabel: 'Edit',
    };
  } catch {
    return {
      id: 'project-claude-md',
      title: 'CLAUDE.md File (Project)',
      description: 'Project-specific instructions for Claude',
      filePath: claudeFilePath,
      status: 'warning',
      statusMessage: 'Failed to read file',
    };
  }
}

export async function checkGlobalClaudeMd(): Promise<OptimizationCheck> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const globalClaudePath = path.join(homeDir, '.claude', 'CLAUDE.md');

  if (!fs.existsSync(globalClaudePath)) {
    return {
      id: 'global-claude-md',
      title: 'CLAUDE.md File (Global)',
      description: 'Global instructions for all projects',
      filePath: globalClaudePath,
      status: 'info',
      statusMessage: 'File not found',
      action: 'claude-files',
      actionLabel: 'Create Global CLAUDE.md',
    };
  }

  try {
    const content = await fs.promises.readFile(globalClaudePath, 'utf-8');
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

    if (nonEmptyLines.length < 5) {
      return {
        id: 'global-claude-md',
        title: 'CLAUDE.md File (Global)',
        description: 'Global instructions for all projects',
        filePath: globalClaudePath,
        status: 'warning',
        statusMessage: 'File is too short (< 5 lines)',
        action: 'claude-files',
        actionLabel: 'Edit',
      };
    }

    const charCount = content.length;
    return {
      id: 'global-claude-md',
      title: 'CLAUDE.md File (Global)',
      description: 'Global instructions for all projects',
      filePath: globalClaudePath,
      status: 'passed',
      statusMessage: `${lines.length} lines, ${charCount} characters`,
      action: 'claude-files',
      actionLabel: 'Edit',
    };
  } catch {
    return {
      id: 'global-claude-md',
      title: 'CLAUDE.md File (Global)',
      description: 'Global instructions for all projects',
      filePath: globalClaudePath,
      status: 'warning',
      statusMessage: 'Failed to read file',
    };
  }
}

export async function checkRoadmap(projectPath: string): Promise<OptimizationCheck> {
  const roadmapPath = path.join(projectPath, 'doc', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    return {
      id: 'roadmap-md',
      title: 'ROADMAP.md File',
      description: 'Project development roadmap',
      filePath: roadmapPath,
      status: 'info',
      statusMessage: 'File not found',
      action: 'create',
      actionLabel: 'Create ROADMAP.md',
    };
  }

  try {
    const content = await fs.promises.readFile(roadmapPath, 'utf-8');
    const lines = content.split('\n');
    const hasPhases = content.includes('## Phase');
    const hasMilestones = content.includes('### Milestone');

    if (!hasPhases && !hasMilestones) {
      return {
        id: 'roadmap-md',
        title: 'ROADMAP.md File',
        description: 'Project development roadmap',
        filePath: roadmapPath,
        status: 'warning',
        statusMessage: 'No phases or milestones found',
        action: 'edit',
        actionLabel: 'Edit ROADMAP.md',
      };
    }

    const charCount = content.length;
    return {
      id: 'roadmap-md',
      title: 'ROADMAP.md File',
      description: 'Project development roadmap',
      filePath: roadmapPath,
      status: 'passed',
      statusMessage: `${lines.length} lines, ${charCount} characters`,
      action: 'edit',
      actionLabel: 'Edit',
    };
  } catch {
    return {
      id: 'roadmap-md',
      title: 'ROADMAP.md File',
      description: 'Project development roadmap',
      filePath: roadmapPath,
      status: 'warning',
      statusMessage: 'Failed to read file',
    };
  }
}

export function findClaudeFiles(projectPath: string): ClaudeFile[] {
  const files: ClaudeFile[] = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';

  // Check global CLAUDE.md in ~/.claude/
  const globalClaudePath = path.join(homeDir, '.claude', 'CLAUDE.md');

  if (fs.existsSync(globalClaudePath)) {
    try {
      const content = fs.readFileSync(globalClaudePath, 'utf-8');
      const stats = fs.statSync(globalClaudePath);
      files.push({
        path: globalClaudePath,
        name: 'CLAUDE.md (Global)',
        content,
        size: stats.size,
        isGlobal: true,
      });
    } catch {
      // Ignore read errors
    }
  }

  // Check project CLAUDE.md
  const projectClaudePath = path.join(projectPath, 'CLAUDE.md');

  if (fs.existsSync(projectClaudePath)) {
    try {
      const content = fs.readFileSync(projectClaudePath, 'utf-8');
      const stats = fs.statSync(projectClaudePath);
      files.push({
        path: projectClaudePath,
        name: 'CLAUDE.md (Project)',
        content,
        size: stats.size,
        isGlobal: false,
      });
    } catch {
      // Ignore read errors
    }
  }

  // Check .claude/CLAUDE.md in project (per-project local)
  const localClaudePath = path.join(projectPath, '.claude', 'CLAUDE.md');

  if (fs.existsSync(localClaudePath)) {
    try {
      const content = fs.readFileSync(localClaudePath, 'utf-8');
      const stats = fs.statSync(localClaudePath);
      files.push({
        path: localClaudePath,
        name: 'CLAUDE.md (Local)',
        content,
        size: stats.size,
        isGlobal: false,
      });
    } catch {
      // Ignore read errors
    }
  }

  return files;
}