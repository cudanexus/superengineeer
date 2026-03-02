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

const execFileAsync = promisify(execFile);

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

async function getAbilitiesCatalogFromSettings(
  deps: ProjectRouterDependencies
): Promise<AbilityCatalogItem[]> {
  const settings = await deps.settingsRepository.get();
  const abilities = Array.isArray(settings.abilities) ? settings.abilities : [];
  return abilities
    .map(normalizeAbility)
    .filter((ability) => ability.id && ability.name && ability.repoUrl && ability.sourceSubdir);
}

async function saveAbilitiesCatalogToSettings(
  deps: ProjectRouterDependencies,
  abilities: AbilityCatalogItem[]
): Promise<void> {
  await deps.settingsRepository.update({ abilities });
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

export function createAbilitiesRouter(deps: ProjectRouterDependencies): Router {
  const router = Router({ mergeParams: true });
  const { projectRepository } = deps;

  router.get('/catalog', validateProjectExists(projectRepository), asyncHandler(async (_req: Request, res: Response) => {
    const abilities = await getAbilitiesCatalogFromSettings(deps);
    res.json({ abilities: abilities.filter((ability) => ability.enabled) });
  }));

  router.get('/catalog/all', validateProjectExists(projectRepository), asyncHandler(async (_req: Request, res: Response) => {
    const abilities = await getAbilitiesCatalogFromSettings(deps);
    res.json({ abilities });
  }));

  router.post('/catalog', validateProjectExists(projectRepository), validateBody(createAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as CreateAbilityBody;
    const abilities = await getAbilitiesCatalogFromSettings(deps);
    const newAbility = normalizeAbility({
      id: String(body.id || ''),
      name: String(body.name || ''),
      description: String(body.description || ''),
      repoUrl: String(body.repoUrl || ''),
      sourceSubdir: String(body.sourceSubdir || ''),
      enabled: body.enabled !== false,
    });

    if (!newAbility.id) {
      throw new ValidationError('Invalid ability ID');
    }
    if (abilities.some((ability) => ability.id === newAbility.id)) {
      throw new ValidationError(`Ability ID already exists: ${newAbility.id}`);
    }

    const updated = [...abilities, newAbility];
    await saveAbilitiesCatalogToSettings(deps, updated);
    res.status(201).json({ success: true, ability: newAbility });
  }));

  router.put('/catalog/:abilityId', validateProjectExists(projectRepository), validateBody(updateAbilitySchema), asyncHandler(async (req: Request, res: Response) => {
    const abilityId = normalizeAbilityId(String(req.params['abilityId'] || ''));
    if (!abilityId) {
      throw new ValidationError('Ability ID is required');
    }

    const body = req.body as UpdateAbilityBody;
    const abilities = await getAbilitiesCatalogFromSettings(deps);
    const index = abilities.findIndex((ability) => ability.id === abilityId);
    if (index === -1) {
      throw new ValidationError('Ability not found');
    }

    const current = abilities[index]!;
    const updatedAbility = normalizeAbility({
      ...current,
      name: body.name !== undefined ? body.name : current.name,
      description: body.description !== undefined ? body.description : current.description,
      repoUrl: body.repoUrl !== undefined ? body.repoUrl : current.repoUrl,
      sourceSubdir: body.sourceSubdir !== undefined ? body.sourceSubdir : current.sourceSubdir,
      enabled: body.enabled !== undefined ? body.enabled : current.enabled,
      id: current.id,
    });

    const next = abilities.slice();
    next[index] = updatedAbility;
    await saveAbilitiesCatalogToSettings(deps, next);
    res.json({ success: true, ability: updatedAbility });
  }));

  router.delete('/catalog/:abilityId', validateProjectExists(projectRepository), asyncHandler(async (req: Request, res: Response) => {
    const abilityId = normalizeAbilityId(String(req.params['abilityId'] || ''));
    if (!abilityId) {
      throw new ValidationError('Ability ID is required');
    }

    const abilities = await getAbilitiesCatalogFromSettings(deps);
    const next = abilities.filter((ability) => ability.id !== abilityId);
    if (next.length === abilities.length) {
      throw new ValidationError('Ability not found');
    }

    await saveAbilitiesCatalogToSettings(deps, next);
    res.json({ success: true });
  }));

  router.post(
    '/install',
    validateProjectExists(projectRepository),
    validateBody(installAbilitySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const project = req.project!;
      const body = req.body as InstallAbilityBody;
      const abilityId = String(body.abilityId || '').trim();
      const abilities = await getAbilitiesCatalogFromSettings(deps);
      const ability = abilities.find((item) => item.id === abilityId && item.enabled);

      if (!ability) {
        throw new ValidationError('Invalid ability selection');
      }

      const skillsDir = path.join(project.path, '.superengineer-v5', '.claude', 'skills');
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

        await copyDirectoryContents(sourceDir, skillsDir);

        res.json({
          success: true,
          abilityId: ability.id,
          abilityName: ability.name,
          skillsPath: skillsDir,
        });
      } finally {
        await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    }),
  );

  return router;
}
