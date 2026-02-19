import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR_NAME = '.superengineer-v5';

export function getDataDirectory(): string {
  const homeDir = os.homedir();
  const dataDir = path.join(homeDir, DATA_DIR_NAME);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dataDir;
}
