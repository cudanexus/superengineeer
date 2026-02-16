/**
 * Run Config Import Service
 * Detects project configuration files and suggests run configurations.
 */

import fs from 'fs';
import path from 'path';
import { CreateRunConfigData } from './types';
import { ImportableConfig, ImportScanResult, RunConfigImportService } from './import-types';
import { getLogger } from '../../utils';

interface PackageJson {
  scripts?: Record<string, string>;
}

interface CargoToml {
  name?: string;
  hasBin?: boolean;
}

const logger = getLogger('run-config-import');

export class DefaultRunConfigImportService implements RunConfigImportService {
  async scan(projectPath: string): Promise<ImportScanResult> {
    const importable: ImportableConfig[] = [];

    const scanners = [
      this.scanPackageJson(projectPath),
      this.scanCargoToml(projectPath),
      this.scanGoMod(projectPath),
      this.scanMakefile(projectPath),
      this.scanPyProject(projectPath),
    ];

    const results = await Promise.all(scanners);

    for (const result of results) {
      if (result && result.configs.length > 0) {
        importable.push(result);
      }
    }

    return { projectPath, importable };
  }

  private async scanPackageJson(
    projectPath: string
  ): Promise<ImportableConfig | null> {
    const filePath = path.join(projectPath, 'package.json');

    if (!await this.fileExists(filePath)) return null;

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const pkg = JSON.parse(content) as PackageJson;
      const configs = this.extractNpmConfigs(pkg);

      if (configs.length === 0) return null;

      return { source: 'package.json', sourceFile: 'package.json', configs };
    } catch (err) {
      logger.warn('Failed to parse package.json', { error: err });
      return null;
    }
  }

  private extractNpmConfigs(pkg: PackageJson): CreateRunConfigData[] {
    const scripts = pkg.scripts || {};
    const configs: CreateRunConfigData[] = [];
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    for (const name of Object.keys(scripts)) {
      configs.push({
        name: `npm: ${name}`,
        command: npmCmd,
        args: ['run', name],
      });
    }

    return configs;
  }

  private async scanCargoToml(
    projectPath: string
  ): Promise<ImportableConfig | null> {
    const filePath = path.join(projectPath, 'Cargo.toml');

    if (!await this.fileExists(filePath)) return null;

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = this.parseCargoTomlBasic(content);
      const configs: CreateRunConfigData[] = [];

      configs.push({
        name: 'cargo: build',
        command: 'cargo',
        args: ['build'],
      });

      configs.push({
        name: 'cargo: run',
        command: 'cargo',
        args: ['run'],
      });

      configs.push({
        name: 'cargo: test',
        command: 'cargo',
        args: ['test'],
      });

      if (parsed.hasBin) {
        configs.push({
          name: 'cargo: build --release',
          command: 'cargo',
          args: ['build', '--release'],
        });
      }

      return { source: 'Cargo.toml', sourceFile: 'Cargo.toml', configs };
    } catch (err) {
      logger.warn('Failed to parse Cargo.toml', { error: err });
      return null;
    }
  }

  private parseCargoTomlBasic(content: string): CargoToml {
    const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
    const hasBin = content.includes('[[bin]]');

    return {
      name: nameMatch ? nameMatch[1] : undefined,
      hasBin,
    };
  }

  private async scanGoMod(
    projectPath: string
  ): Promise<ImportableConfig | null> {
    const filePath = path.join(projectPath, 'go.mod');

    if (!await this.fileExists(filePath)) return null;

    const configs: CreateRunConfigData[] = [];

    configs.push({
      name: 'go: build',
      command: 'go',
      args: ['build', './...'],
    });

    configs.push({
      name: 'go: run',
      command: 'go',
      args: ['run', '.'],
    });

    configs.push({
      name: 'go: test',
      command: 'go',
      args: ['test', './...'],
    });

    return { source: 'go.mod', sourceFile: 'go.mod', configs };
  }

  private async scanMakefile(
    projectPath: string
  ): Promise<ImportableConfig | null> {
    const filePath = path.join(projectPath, 'Makefile');

    if (!await this.fileExists(filePath)) return null;

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const configs = this.extractMakeTargets(content);

      if (configs.length === 0) return null;

      return { source: 'Makefile', sourceFile: 'Makefile', configs };
    } catch (err) {
      logger.warn('Failed to parse Makefile', { error: err });
      return null;
    }
  }

  private extractMakeTargets(content: string): CreateRunConfigData[] {
    const configs: CreateRunConfigData[] = [];
    const targetRegex = /^([a-zA-Z_][a-zA-Z0-9_-]*):/gm;
    let match;

    while ((match = targetRegex.exec(content)) !== null) {
      const target = match[1]!;

      // Skip internal/hidden targets
      if (target.startsWith('_') || target.startsWith('.')) continue;

      configs.push({
        name: `make: ${target}`,
        command: 'make',
        args: [target],
      });
    }

    return configs;
  }

  private async scanPyProject(
    projectPath: string
  ): Promise<ImportableConfig | null> {
    // Check for pyproject.toml or requirements.txt
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    const hasPyProject = await this.fileExists(pyprojectPath);
    const hasRequirements = await this.fileExists(requirementsPath);

    if (!hasPyProject && !hasRequirements) return null;

    const sourceFile = hasPyProject ? 'pyproject.toml' : 'requirements.txt';
    const configs: CreateRunConfigData[] = [];

    if (hasPyProject) {
      configs.push({
        name: 'python: run',
        command: 'python',
        args: ['-m', 'main'],
      });

      configs.push({
        name: 'pytest: test',
        command: 'python',
        args: ['-m', 'pytest'],
      });
    }

    if (hasRequirements) {
      configs.push({
        name: 'pip: install',
        command: 'pip',
        args: ['install', '-r', 'requirements.txt'],
      });
    }

    return { source: sourceFile, sourceFile, configs };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
