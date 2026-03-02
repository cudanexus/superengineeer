import { Router, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { validateBody } from '../middleware/validation';
import { asyncHandler, ValidationError } from '../utils';
import { ProjectRepository, AbilityCatalogItem } from '../repositories';
import { createAbilitySchema, installAbilitySchema, updateAbilitySchema } from './projects/schemas';
import { CreateAbilityBody, InstallAbilityBody, UpdateAbilityBody } from './projects/types';
import { z } from 'zod';
import {
  createCatalogAbility,
  deleteCatalogAbility,
  listCatalogAbilities,
  updateCatalogAbility,
} from './abilities-catalog-client';

const execFileAsync = promisify(execFile);

interface AbilitiesRouterDeps {
  projectRepository: ProjectRepository;
}

function normalizeAbilityId(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeAbility(input: AbilityCatalogItem): AbilityCatalogItem {
  return {
    id: normalizeAbilityId(input.id),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    repoUrl: String(input.repoUrl || '').trim(),
    sourceSubdir: String(input.sourceSubdir || '').trim(),
    enabled: input.enabled !== false,
  };
}

async function copyDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(sourceDir, entry.name);
    const dst = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryContents(src, dst);
      continue;
    }
    if (entry.isFile()) {
      await fs.promises.copyFile(src, dst);
    }
  }
}

async function installAbilityToTarget(
  ability: AbilityCatalogItem,
  targetDir: string
): Promise<void> {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'se-ability-global-'));
  const cloneDir = path.join(tempRoot, 'repo');
  try {
    await execFileAsync('git', ['clone', '--depth', '1', ability.repoUrl, cloneDir], {
      cwd: tempRoot,
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const sourceDir = path.join(cloneDir, ability.sourceSubdir);
    const sourceStats = await fs.promises.stat(sourceDir).catch(() => null);
    if (!sourceStats || !sourceStats.isDirectory()) {
      throw new ValidationError(`Ability source folder not found: ${ability.sourceSubdir}`);
    }
    await copyDirectoryContents(sourceDir, targetDir);
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function createAbilitiesRouter(deps: AbilitiesRouterDeps): Router {
  const router = Router();
  const { projectRepository } = deps;
  const getAuthHeader = (req: Request): string | undefined => req.header('authorization') || undefined;

  router.get('/catalog', asyncHandler(async (_req: Request, res: Response) => {
    const abilities = await listCatalogAbilities(false, getAuthHeader(_req));
    res.json({ abilities: abilities.map(normalizeAbility) });
  }));

  router.get('/catalog/all', asyncHandler(async (req: Request, res: Response) => {
    const abilities = await listCatalogAbilities(true, getAuthHeader(req));
    res.json({ abilities: abilities.map(normalizeAbility) });
  }));

  router.post('/catalog', validateBody(createAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateAbilityBody;
    const ability = normalizeAbility({
      id: String(body.id || ''),
      name: String(body.name || ''),
      description: String(body.description || ''),
      repoUrl: String(body.repoUrl || ''),
      sourceSubdir: String(body.sourceSubdir || ''),
      enabled: body.enabled !== false,
    });

    if (!ability.id) throw new ValidationError('Invalid ability ID');
    const created = await createCatalogAbility(ability, getAuthHeader(req));
    res.status(201).json({ success: true, ability: normalizeAbility(created) });
  }));

  router.put('/catalog/:abilityId', validateBody(updateAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const abilityId = normalizeAbilityId(String(req.params['abilityId'] || ''));
    if (!abilityId) throw new ValidationError('Ability ID is required');

    const body = req.body as UpdateAbilityBody;
    const updated = await updateCatalogAbility(abilityId, {
      name: body.name,
      description: body.description,
      repoUrl: body.repoUrl,
      sourceSubdir: body.sourceSubdir,
      enabled: body.enabled,
    }, getAuthHeader(req));
    res.json({ success: true, ability: normalizeAbility(updated) });
  }));

  router.delete('/catalog/:abilityId', asyncHandler(async (req: Request, res: Response) => {
    const abilityId = normalizeAbilityId(String(req.params['abilityId'] || ''));
    if (!abilityId) throw new ValidationError('Ability ID is required');

    await deleteCatalogAbility(abilityId, getAuthHeader(req));
    res.json({ success: true });
  }));

  router.post('/install/global', validateBody(installAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as InstallAbilityBody;
    const abilityId = String(body.abilityId || '').trim();
    const abilities = await listCatalogAbilities(false, getAuthHeader(req));
    const ability = abilities.find((item) => item.id === abilityId && item.enabled);
    if (!ability) throw new ValidationError('Invalid ability selection');

    const globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');
    await installAbilityToTarget(ability, globalSkillsDir);
    res.json({ success: true, abilityId: ability.id, abilityName: ability.name, skillsPath: globalSkillsDir });
  }));

  const installProjectAbilitySchema = z.object({
    abilityId: z.string().min(1, 'Ability ID is required'),
    projectId: z.string().min(1, 'projectId is required'),
  });

  router.post('/install/project', validateBody(installProjectAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as InstallAbilityBody & { projectId?: string };
    const abilityId = String(body.abilityId || '').trim();
    const projectId = String(body.projectId || '').trim();
    if (!projectId) throw new ValidationError('projectId is required');

    const project = await projectRepository.findById(projectId);
    if (!project) throw new ValidationError('Project not found');

    const abilities = await listCatalogAbilities(false, getAuthHeader(req));
    const ability = abilities.find((item) => item.id === abilityId && item.enabled);
    if (!ability) throw new ValidationError('Invalid ability selection');

    const projectSkillsDir = path.join(project.path, '.superengineer-v5', '.claude', 'skills');
    await installAbilityToTarget(ability, projectSkillsDir);
    res.json({ success: true, abilityId: ability.id, abilityName: ability.name, skillsPath: projectSkillsDir, projectId });
  }));

  return router;
}
