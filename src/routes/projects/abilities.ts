import { Router, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { asyncHandler, ValidationError } from '../../utils';
import { validateBody } from '../../middleware/validation';
import { validateProjectExists } from '../../middleware/project';
import { createAbilitySchema, installAbilitySchema, updateAbilitySchema } from './schemas';
import {
  ProjectRouterDependencies,
  InstallAbilityBody,
  CreateAbilityBody,
  UpdateAbilityBody,
} from './types';
import { AbilityCatalogItem } from '../../repositories/settings';
import {
  createCatalogAbility,
  deleteCatalogAbility,
  listCatalogAbilities,
  updateCatalogAbility,
} from '../abilities-catalog-client';

const execFileAsync = promisify(execFile);
const INSTALLED_ABILITIES_MANIFEST = '.superengineer-installed-abilities.json';

interface InstallAbilityResult {
  abilityId: string;
  abilityName: string;
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
    imageUrl: String(input.imageUrl || '').trim() || undefined,
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

function getInstalledAbilitiesManifestPath(targetDir: string): string {
  return path.join(targetDir, INSTALLED_ABILITIES_MANIFEST);
}

async function readInstalledAbilityIds(targetDir: string): Promise<string[]> {
  const manifestPath = getInstalledAbilitiesManifestPath(targetDir);
  const raw = await fs.promises.readFile(manifestPath, 'utf-8').catch(() => '');
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { abilityIds?: unknown };
    if (!Array.isArray(parsed.abilityIds)) return [];
    return Array.from(new Set(parsed.abilityIds
      .map((id) => String(id || '').trim())
      .filter((id) => id.length > 0)));
  } catch {
    return [];
  }
}

async function markInstalledAbilityIds(targetDir: string, abilityIds: string[]): Promise<void> {
  const existing = await readInstalledAbilityIds(targetDir);
  const merged = Array.from(new Set([
    ...existing,
    ...abilityIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0),
  ]));

  await fs.promises.mkdir(targetDir, { recursive: true });
  const manifestPath = getInstalledAbilitiesManifestPath(targetDir);
  await fs.promises.writeFile(manifestPath, JSON.stringify({
    abilityIds: merged,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf-8');
}

function resolveRequestedAbilityIds(body: InstallAbilityBody): string[] {
  const singleId = String(body.abilityId || '').trim();
  const requestedIds = Array.isArray(body.abilityIds) ? body.abilityIds : [];
  const normalizedList = requestedIds
    .map((id) => String(id || '').trim())
    .filter((id) => id.length > 0);
  const merged = singleId ? [singleId, ...normalizedList] : normalizedList;
  return Array.from(new Set(merged));
}

async function installSelectedAbilities(
  abilityIds: string[],
  targetDir: string,
  authHeader?: string
): Promise<InstallAbilityResult[]> {
  if (abilityIds.length === 0) {
    throw new ValidationError('At least one ability must be selected');
  }

  const catalog = await listCatalogAbilities(false, authHeader);
  const abilitiesById = new Map<string, AbilityCatalogItem>();
  catalog.forEach((item) => {
    if (item.enabled) {
      abilitiesById.set(item.id, item);
    }
  });

  const invalidAbilityId = abilityIds.find((abilityId) => !abilitiesById.has(abilityId));
  if (invalidAbilityId) {
    throw new ValidationError(`Invalid ability selection: ${invalidAbilityId}`);
  }

  const installed: InstallAbilityResult[] = [];
  for (const abilityId of abilityIds) {
    const ability = abilitiesById.get(abilityId);
    if (!ability) {
      throw new ValidationError(`Invalid ability selection: ${abilityId}`);
    }

    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'se-ability-'));
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
      installed.push({ abilityId: ability.id, abilityName: ability.name });
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return installed;
}

export function createAbilitiesRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const { projectRepository } = deps;
  const getAuthHeader = (req: Request): string | undefined => req.header('authorization') || undefined;

  router.get('/catalog', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const abilities = await listCatalogAbilities(false, getAuthHeader(req));
    res.json({ abilities: abilities.map(normalizeAbility) });
  }));

  router.get('/catalog/all', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const abilities = await listCatalogAbilities(true, getAuthHeader(req));
    res.json({ abilities: abilities.map(normalizeAbility) });
  }));

  router.get('/installed', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const project = req.project!;
    const skillsDir = path.join(project.path, '.superengineer-v5', '.claude', 'skills');
    const abilityIds = await readInstalledAbilityIds(skillsDir);
    res.json({ abilityIds });
  }));

  router.post('/catalog', validateProjectExists(projectRepository), validateBody(createAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateAbilityBody;
    const newAbility = normalizeAbility({
      id: String(body.id || ''),
      name: String(body.name || ''),
      description: String(body.description || ''),
      imageUrl: String(body.imageUrl || ''),
      repoUrl: String(body.repoUrl || ''),
      sourceSubdir: String(body.sourceSubdir || ''),
      enabled: body.enabled !== false,
    });

    if (!newAbility.id) {
      throw new ValidationError('Invalid ability ID');
    }
    const created = await createCatalogAbility(newAbility, getAuthHeader(req));
    res.status(201).json({ success: true, ability: normalizeAbility(created) });
  }));

  router.put('/catalog/:abilityId', validateProjectExists(projectRepository), validateBody(updateAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const abilityId = normalizeAbilityId(String(req.params['abilityId'] || ''));
    if (!abilityId) {
      throw new ValidationError('Ability ID is required');
    }

    const body = req.body as UpdateAbilityBody;
    const updatedAbility = await updateCatalogAbility(abilityId, {
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      repoUrl: body.repoUrl,
      sourceSubdir: body.sourceSubdir,
      enabled: body.enabled,
    }, getAuthHeader(req));

    res.json({ success: true, ability: normalizeAbility(updatedAbility) });
  }));

  router.delete('/catalog/:abilityId', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const abilityId = normalizeAbilityId(String(req.params['abilityId'] || ''));
    if (!abilityId) {
      throw new ValidationError('Ability ID is required');
    }

    await deleteCatalogAbility(abilityId, getAuthHeader(req));
    res.json({ success: true });
  }));

  router.post(
    '/install',
    validateProjectExists(projectRepository),
    validateBody(installAbilitySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const project = req.project!;
      const body = req.body as InstallAbilityBody;
      const abilityIds = resolveRequestedAbilityIds(body);

      const skillsDir = path.join(project.path, '.superengineer-v5', '.claude', 'skills');
      const installed = await installSelectedAbilities(abilityIds, skillsDir, getAuthHeader(req));
      await markInstalledAbilityIds(skillsDir, installed.map((item) => item.abilityId));
      const primary = installed[0] || null;

      res.json({
        success: true,
        abilityId: primary ? primary.abilityId : null,
        abilityName: primary ? primary.abilityName : null,
        installedAbilities: installed,
        installedCount: installed.length,
        skillsPath: skillsDir,
      });
    }),
  );

  return router;
}
