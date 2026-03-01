import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { asyncHandler, ValidationError, ConflictError, getLogger } from '../../utils';
import { ProjectRouterDependencies, AgentMessageBody } from './types';
import { AgentMessage } from '../../agents';

import { validateBody, validateParams } from '../../middleware/validation';
import { validateProjectExists } from '../../middleware/project';
import { agentOperationRateLimit, moderateRateLimit } from '../../middleware/rate-limit';
import { getDefaultWorkflowRules, stripProtectedSection } from '../../constants/claude-workflow';
import {
  agentMessageSchema,
  agentRewindSchema,
  agentSendMessageSchema,
  projectAndQueueIndexSchema
} from './schemas';

const execFileAsync = promisify(execFile);

/**
 * Truncate Claude's session JSONL file by removing the last `turns` user+assistant
 * turn pairs so that Claude's internal memory matches the rewound state.
 *
 * Each line in the JSONL is an independent JSON entry. A "turn" = one user entry
 * followed by one or more assistant/snapshot entries. We walk backward from the
 * end of the file, find the N-th user entry, and drop every line from that
 * entry onward.
 */
async function truncateClaudeSessionFile(
  projectPath: string,
  sessionId: string,
  turns: number
): Promise<{ truncated: boolean; removedLines: number }> {
  if (!sessionId || turns <= 0) {
    return { truncated: false, removedLines: 0 };
  }

  // Claude encodes the project path as: replace every '/' with '-'
  // e.g. /home/syed/Documents/superengineeer → -home-syed-Documents-superengineeer
  const encodedPath = projectPath.replace(/\//g, '-');
  const claudeConfigDir = path.join(projectPath, '.superengineer-v5', '.claude');
  const sessionFile = path.join(claudeConfigDir, 'projects', encodedPath, `${sessionId}.jsonl`);

  let content: string;
  try {
    content = await fs.promises.readFile(sessionFile, 'utf-8');
  } catch {
    // JSONL file doesn't exist yet (session never saved) — nothing to truncate
    return { truncated: false, removedLines: 0 };
  }

  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { truncated: false, removedLines: 0 };
  }

  // Walk backward and find the index of the N-th user message from the end
  let userTurnsFound = 0;
  let cutLine = lines.length; // keep all lines by default

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]!) as Record<string, unknown>;
      if (entry.type === 'user' && !entry.isMeta) {
        userTurnsFound++;
        if (userTurnsFound >= turns) {
          cutLine = i;
          break;
        }
      }
    } catch {
      // Skip unparseable lines
    }
  }

  if (cutLine >= lines.length) {
    // Not enough turns found — nothing to truncate
    return { truncated: false, removedLines: 0 };
  }

  const removedLines = lines.length - cutLine;
  const keptContent = lines.slice(0, cutLine).join('\n') + '\n';

  await fs.promises.writeFile(sessionFile, keptContent, 'utf-8');
  return { truncated: true, removedLines };
}

interface AttachedFileInput {
  url: string;
  fileName?: string;
}

function sanitizeAttachmentFileName(value: string): string {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.length > 0 ? base : 'attachment.bin';
}

function normalizeDownloadUrl(rawUrl: string): string {
  try {
    // URL() canonicalizes unsafe characters like spaces to percent-encoding.
    return new URL(rawUrl).toString();
  } catch {
    // Fallback for malformed-but-salvageable inputs.
    return String(rawUrl || '').trim().replace(/ /g, '%20');
  }
}

function buildMessageWithDownloadedFiles(message: string, downloadedPaths: string[]): string {
  if (downloadedPaths.length === 0) {
    return message;
  }

  const fileSection = [
    'Attached files have been downloaded locally:',
    ...downloadedPaths.map((p) => `- ${p}`),
    '',
  ].join('\n');

  if (message && message.trim().length > 0) {
    return `${fileSection}\nUser message:\n${message}`;
  }

  return `${fileSection}\nPlease inspect the attached files and proceed.`;
}

async function downloadAttachedFiles(projectPath: string, files: AttachedFileInput[]): Promise<string[]> {
  if (!files || files.length === 0) {
    return [];
  }

  const downloadsDir = path.join(projectPath, '.superengineer', 'attachments');
  await fs.promises.mkdir(downloadsDir, { recursive: true });

  const downloadedPaths: string[] = [];

  for (const file of files) {
    try {
      let urlPathName = '';
      try {
        urlPathName = decodeURIComponent((new URL(file.url)).pathname.split('/').pop() || '');
      } catch {
        urlPathName = '';
      }

      const parsedName = file.fileName || urlPathName || 'attachment.bin';
      const safeName = sanitizeAttachmentFileName(parsedName);
      const localName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const localPath = path.join(downloadsDir, localName);

      const downloadUrl = normalizeDownloadUrl(file.url);
      await execFileAsync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', localPath, downloadUrl], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });

      downloadedPaths.push(localPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const label = file.fileName || file.url;
      throw new ValidationError(`Failed to download attached file "${label}": ${detail}`);
    }
  }

  return downloadedPaths;
}

export function createAgentRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const {
    projectRepository,
    agentManager,
    conversationRepository,
  } = deps;

  // Start autonomous loop
  router.post('/start', validateProjectExists(projectRepository), agentOperationRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = req.project!;

    if (agentManager.isRunning(id)) {
      throw new ConflictError('Agent is already running');
    }

    // Validate roadmap exists before starting
    const roadmapPath = path.join((project).path, 'doc', 'ROADMAP.md');

    try {
      await fs.promises.access(roadmapPath);
    } catch {
      throw new ValidationError('Roadmap not found. A ROADMAP.md file is required to start the agent.');
    }

    try {
      const body = req.body as AgentMessageBody;
      const claudeMdPath = path.join(project.path, 'CLAUDE.md');

      let content = '';
      if (fs.existsSync(claudeMdPath)) {
        content = await fs.promises.readFile(claudeMdPath, 'utf-8');
      }

      const { strippedContent } = stripProtectedSection(content);
      const newContent = getDefaultWorkflowRules(body?.currentUrl) + strippedContent;
      await fs.promises.writeFile(claudeMdPath, newContent, 'utf-8');
    } catch (error) {
      // silently skip if we cannot write or read claude md
    }

    await agentManager.startAutonomousLoop(id);
    res.json({ success: true, status: agentManager.isQueued(id) ? 'queued' : 'running' });
  }));

  // Stop agent
  router.post('/stop', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;

    await agentManager.stopAgent(id);
    res.json({ success: true, status: 'stopped' });
  }));

  // Get agent status
  router.get('/status', validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;

    const fullStatus = agentManager.getFullStatus(id);
    res.json(fullStatus);
  }));

  // Get context usage for running agent or last saved usage
  router.get('/context', validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const project = req.project!;

    // First try to get from running agent
    let contextUsage = agentManager.getContextUsage(id);

    // If agent is not running, use last saved context usage from project status
    if (!contextUsage && (project).lastContextUsage) {
      contextUsage = (project).lastContextUsage;
    }

    res.json({ contextUsage });
  }));

  // Get accumulated token/cost summary from Claude result events
  router.get('/cost', validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const summary = agentManager.getProjectCostSummary(id);
    res.json(summary);
  }));

  // Get queued messages for running agent
  router.get('/queue', validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;

    const messages = agentManager.getQueuedMessages(id);
    res.json({ messages });
  }));

  // Get loop status (enhanced with progress tracking)
  router.get('/loop', validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;

    const loopState = agentManager.getLoopState(id);

    if (!loopState) {
      res.json({ isLooping: false, progress: null });
      return;
    }

    res.json(loopState);
  }));

  // Remove project from agent queue
  router.delete('/queue', validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;

    if (!agentManager.isQueued(id)) {
      throw new ValidationError('Agent is not queued');
    }

    agentManager.removeFromQueue(id);
    res.json({ success: true });
  }));

  // Remove a queued message from a running agent
  router.delete('/queue/:index', validateParams(projectAndQueueIndexSchema), validateProjectExists(projectRepository), asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const index = req.params['index'] as unknown as number;

    if (!agentManager.isRunning(id)) {
      throw new ValidationError('Agent is not running');
    }

    const removed = agentManager.removeQueuedMessage(id, index);

    if (!removed) {
      throw new ValidationError('Failed to remove message from queue');
    }

    res.json({ success: true, remainingMessages: agentManager.getQueuedMessages(id) });
  }));

  // Start interactive agent session
  router.post('/interactive', validateBody(agentMessageSchema), validateProjectExists(projectRepository), agentOperationRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const body = req.body as AgentMessageBody;
    const { message, images, files, sessionId, permissionMode } = body;

    if (agentManager.isRunning(id)) {
      const currentMode = agentManager.getAgentMode(id);
      if (currentMode === 'autonomous') {
        throw new ConflictError('An autonomous agent is already running. Stop it first.');
      }
      throw new ConflictError('An agent is already running');
    }

    // Don't validate sessionId - let the agent manager handle session creation/resumption

    try {
      const project = req.project!;
      const claudeMdPath = path.join(project.path, 'CLAUDE.md');

      let content = '';
      if (fs.existsSync(claudeMdPath)) {
        content = await fs.promises.readFile(claudeMdPath, 'utf-8');
      }

      const { strippedContent } = stripProtectedSection(content);
      const newContent = getDefaultWorkflowRules(body?.currentUrl) + strippedContent;
      await fs.promises.writeFile(claudeMdPath, newContent, 'utf-8');
    } catch (error) {
      // silently skip if we cannot write or read claude md
    }

    const downloadedPaths = await downloadAttachedFiles(req.project!.path, files || []);
    const preparedMessage = buildMessageWithDownloadedFiles(message || '', downloadedPaths);

    await agentManager.startInteractiveAgent(id, {
      initialMessage: preparedMessage,
      images,
      sessionId,
      permissionMode,
    });

    const status = agentManager.isQueued(id) ? 'queued' : 'running';
    const actualSessionId = agentManager.getSessionId(id);

    res.json({ success: true, status, mode: 'interactive', sessionId: actualSessionId });
  }));

  // Stop a one-off agent
  router.post('/oneoff/:oneOffId/stop', asyncHandler(async (req: Request, res: Response) => {
    await agentManager.stopOneOffAgent(req.params['oneOffId'] as string);
    res.json({ success: true });
  }));

  // Send input to a one-off agent
  router.post('/oneoff/:oneOffId/send', asyncHandler((req: Request, res: Response) => {
    const oneOffId = req.params['oneOffId'] as string;
    const { message, images } = req.body as AgentMessageBody;

    if (!message && (!images || images.length === 0)) {
      throw new ValidationError('Message is required');
    }

    agentManager.sendOneOffInput(oneOffId, message || '', images);
    res.json({ success: true });
  }));

  // Get one-off agent status
  router.get('/oneoff/:oneOffId/status', asyncHandler((req: Request, res: Response) => {
    const oneOffId = req.params['oneOffId'] as string;
    const status = agentManager.getOneOffStatus(oneOffId);

    if (!status) {
      res.status(404).json({ error: 'One-off agent not found' });
      return;
    }

    res.json(status);
  }));

  // Get one-off agent context usage
  router.get('/oneoff/:oneOffId/context', asyncHandler((req: Request, res: Response) => {
    const oneOffId = req.params['oneOffId'] as string;
    const contextUsage = agentManager.getOneOffContextUsage(oneOffId);
    res.json({ contextUsage });
  }));

  // Answer an AskUserQuestion from the agent
  router.post('/answer', validateProjectExists(projectRepository), moderateRateLimit, asyncHandler((req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const { toolUseId, answers } = req.body as { toolUseId?: string; answers?: Record<string, string | string[]> };

    if (!toolUseId) {
      throw new ValidationError('toolUseId is required');
    }

    if (!answers || typeof answers !== 'object') {
      throw new ValidationError('answers is required');
    }

    if (!agentManager.isRunning(id)) {
      throw new ValidationError('Agent is not running');
    }

    const content = JSON.stringify({ answers });
    agentManager.sendToolResult(id, toolUseId, content);

    res.json({ success: true });
  }));

  // Send input to running interactive agent
  router.post('/send', validateBody(agentSendMessageSchema), validateProjectExists(projectRepository), moderateRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const logger = getLogger('agent-send');
    const id = req.params['id'] as string;
    const body = req.body as AgentMessageBody;
    const { message, images, files } = body;

    logger.info('Received send request', {
      projectId: id,
      messageLength: message?.length ?? 0,
      hasImages: !!images && images.length > 0,
      hasFiles: !!files && files.length > 0,
    });

    if (!agentManager.isRunning(id)) {
      logger.warn('Agent not running', { projectId: id });
      throw new ValidationError('Agent is not running');
    }

    const mode = agentManager.getAgentMode(id);
    if (mode !== 'interactive') {
      logger.warn('Agent not in interactive mode', { projectId: id, mode });
      throw new ValidationError('Agent is not in interactive mode');
    }

    logger.info('Sending input to agent', { projectId: id });
    const downloadedPaths = await downloadAttachedFiles(req.project!.path, files || []);
    const preparedMessage = buildMessageWithDownloadedFiles(message || '', downloadedPaths);
    agentManager.sendInput(id, preparedMessage, images);

    res.json({ success: true });
  }));

  // Rewind last Claude step(s) when interactive agent is waiting for input
  router.post('/rewind', validateBody(agentRewindSchema), validateProjectExists(projectRepository), moderateRateLimit, asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const rewindBody = (req.body as { steps?: number; commitHash?: string } | undefined) || {};
    const steps = Number(rewindBody.steps || 1);
    const commitHash = String(rewindBody.commitHash || '').trim();
    const project = req.project!;

    if (!agentManager.isRunning(id)) {
      throw new ValidationError('Agent is not running');
    }

    const mode = agentManager.getAgentMode(id);
    if (mode !== 'interactive') {
      throw new ValidationError('Rewind is only available in interactive mode');
    }

    if (!agentManager.isWaitingForInput(id)) {
      throw new ValidationError('Rewind is only available when agent is waiting for input');
    }

    const gitExecOptions = {
      cwd: project.path,
      encoding: 'utf-8' as const,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    };

    try {
      const revParse = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], gitExecOptions);
      if (!String(revParse.stdout || '').trim().includes('true')) {
        throw new ValidationError('Rewind unavailable: project is not a git repository');
      }
    } catch (error) {
      throw new ValidationError('Rewind unavailable: project is not a git repository');
    }

    let resetTarget = '';
    let rewoundCommits = 0;
    const beforeHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], gitExecOptions)).stdout.trim();
    if (commitHash) {
      try {
        await execFileAsync('git', ['rev-parse', '--verify', `${commitHash}^{commit}`], gitExecOptions);
      } catch {
        throw new ValidationError('Rewind unavailable: selected commit was not found');
      }
      resetTarget = commitHash;
      try {
        const countRaw = await execFileAsync('git', ['rev-list', '--count', `${commitHash}..${beforeHead}`], gitExecOptions);
        rewoundCommits = Math.max(0, Number(String(countRaw.stdout || '0').trim()) || 0);
      } catch {
        rewoundCommits = 0;
      }
    } else {
      try {
        await execFileAsync('git', ['rev-parse', `HEAD~${steps}`], gitExecOptions);
      } catch {
        throw new ValidationError(`Rewind unavailable: not enough commit history for ${steps} step(s)`);
      }
      resetTarget = `HEAD~${steps}`;
      rewoundCommits = Math.max(0, steps);
    }

    await execFileAsync('git', ['reset', '--hard', resetTarget], gitExecOptions);
    await execFileAsync('git', ['clean', '-fd'], gitExecOptions);

    // Force-push to remote so it matches the rewound local state.
    // Without this the remote still has the rewound commits, causing Claude's
    // subsequent pushes to be rejected with "pull required / conflicts".
    // --force-with-lease fails safely if the remote state isn't what we expect.
    let remoteForceUpdated = false;
    try {
      const currentBranch = (
        await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], gitExecOptions)
      ).stdout.trim();
      if (currentBranch && currentBranch !== 'HEAD') {
        await execFileAsync(
          'git',
          ['push', '--force-with-lease', 'origin', currentBranch],
          gitExecOptions
        );
        remoteForceUpdated = true;
      }
    } catch {
      // No remote, or push not configured — safe to ignore.
      // Claude will still be able to make local commits fine.
    }

    // Trim only the most recent rewound user/assistant turns from persisted conversation
    // instead of clearing whole history.
    const conversationId = project.currentConversationId;
    let conversationTrimmed = false;
    if (conversationId && rewoundCommits > 0) {
      try {
        const currentMessages = await conversationRepository.getMessages(id, conversationId);
        const assistantLikeTypes = new Set(['stdout', 'tool_use', 'tool_result', 'result']);
        let searchIndex = currentMessages.length - 1;
        let cutoffIndex = currentMessages.length;

        for (let turn = 0; turn < rewoundCommits; turn += 1) {
          let userIndex = -1;
          let assistantIndex = -1;

          for (let i = searchIndex; i >= 0; i -= 1) {
            const msg = currentMessages[i];
            if (!msg) continue;

            if (userIndex === -1 && msg.type === 'user') {
              userIndex = i;
            }
            if (assistantIndex === -1 && assistantLikeTypes.has(String(msg.type || ''))) {
              assistantIndex = i;
            }

            if (userIndex !== -1 && assistantIndex !== -1) {
              break;
            }
          }

          if (userIndex === -1 && assistantIndex === -1) {
            break;
          }

          const turnStart = (userIndex === -1)
            ? assistantIndex
            : (assistantIndex === -1)
              ? userIndex
              : Math.min(userIndex, assistantIndex);

          cutoffIndex = turnStart;
          searchIndex = turnStart - 1;
          if (searchIndex < 0) {
            break;
          }
        }

        if (cutoffIndex < currentMessages.length) {
          const keptMessages = currentMessages.slice(0, Math.max(0, cutoffIndex));
          await conversationRepository.clearMessages(id, conversationId);
          for (const message of keptMessages) {
            await conversationRepository.addMessage(id, conversationId, message as AgentMessage);
          }
          conversationTrimmed = true;
        }
      } catch (trimError) {
        // Rewind is already completed at git level; avoid failing the request on trim errors.
      }
    }

    // Truncate Claude's session JSONL so its internal memory matches the rewound state.
    // This removes the last `rewoundCommits` user+assistant turn pairs from the JSONL,
    // so when the agent resumes it will NOT remember the rewound interactions.
    let sessionFileTruncated = false;
    let sessionFileRemovedLines = 0;
    if (rewoundCommits > 0) {
      try {
        const currentSessionId = agentManager.getSessionId(id);
        if (currentSessionId) {
          const truncateResult = await truncateClaudeSessionFile(
            project.path,
            currentSessionId,
            rewoundCommits
          );
          sessionFileTruncated = truncateResult.truncated;
          sessionFileRemovedLines = truncateResult.removedLines;
        }
      } catch {
        // Non-fatal: the git rewind and conversation trim already succeeded.
      }
    }

    const head = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], gitExecOptions);
    const headSha = String(head.stdout || '').trim();
    res.json({
      success: true,
      steps,
      head: headSha,
      target: resetTarget,
      byCommitHash: Boolean(commitHash),
      rewoundCommits,
      conversationTrimmed,
      sessionFileTruncated,
      sessionFileRemovedLines,
      remoteForceUpdated,
    });
  }));

  return router;
}
