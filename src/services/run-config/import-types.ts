/**
 * Types for run configuration import/detection
 */

import { CreateRunConfigData } from './types';

export interface ImportableConfig {
  source: string;           // e.g., "package.json", "Cargo.toml"
  sourceFile: string;       // relative path to the source file
  configs: CreateRunConfigData[];
}

export interface ImportScanResult {
  projectPath: string;
  importable: ImportableConfig[];
}

export interface RunConfigImportService {
  scan(projectPath: string): Promise<ImportScanResult>;
}
