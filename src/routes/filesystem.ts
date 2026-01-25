import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export interface FilesystemService {
  listDrives(): Promise<DriveInfo[]>;
  listDirectory(dirPath: string): Promise<DirectoryEntry[]>;
  listDirectoryWithFiles(dirPath: string): Promise<DirectoryEntry[]>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  createDirectory(dirPath: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  deleteDirectory(dirPath: string): Promise<void>;
  isTextFile(filePath: string): boolean;
}

export interface DriveInfo {
  name: string;
  path: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

abstract class BaseFilesystemService implements FilesystemService {
  abstract listDrives(): Promise<DriveInfo[]>;

  async listDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    const normalizedPath = path.normalize(dirPath);
    const entries = await fs.promises.readdir(normalizedPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
        isDirectory: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listDirectoryWithFiles(dirPath: string): Promise<DirectoryEntry[]> {
    const normalizedPath = path.normalize(dirPath);
    const entries = await fs.promises.readdir(normalizedPath, { withFileTypes: true });

    const result = entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
        isDirectory: entry.isDirectory(),
      }));

    return result.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(filePath: string): Promise<string> {
    const normalizedPath = path.normalize(filePath);
    return fs.promises.readFile(normalizedPath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = path.normalize(filePath);
    await fs.promises.writeFile(normalizedPath, content, 'utf-8');
  }

  async createDirectory(dirPath: string): Promise<void> {
    const normalizedPath = path.normalize(dirPath);
    await fs.promises.mkdir(normalizedPath, { recursive: false });
  }

  async deleteFile(filePath: string): Promise<void> {
    const normalizedPath = path.normalize(filePath);
    await fs.promises.unlink(normalizedPath);
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const normalizedPath = path.normalize(dirPath);
    await fs.promises.rm(normalizedPath, { recursive: true });
  }

  isTextFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return TEXT_FILE_EXTENSIONS.has(ext);
  }
}

export class WindowsFilesystemService extends BaseFilesystemService {
  async listDrives(): Promise<DriveInfo[]> {
    const drives: DriveInfo[] = [];

    for (let charCode = 65; charCode <= 90; charCode++) {
      const letter = String.fromCharCode(charCode);
      const drivePath = `${letter}:\\`;

      if (await this.driveExists(drivePath)) {
        drives.push({ name: `${letter}:`, path: drivePath });
      }
    }

    return drives;
  }

  private async driveExists(drivePath: string): Promise<boolean> {
    try {
      await fs.promises.access(drivePath);
      return true;
    } catch {
      return false;
    }
  }
}

export class UnixFilesystemService extends BaseFilesystemService {
  async listDrives(): Promise<DriveInfo[]> {
    const drives: DriveInfo[] = [{ name: '/', path: '/' }];

    if (await this.directoryExists('/Volumes')) {
      const volumes = await this.listMountedVolumes();
      drives.push(...volumes);
    }

    return drives;
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async listMountedVolumes(): Promise<DriveInfo[]> {
    try {
      const entries = await fs.promises.readdir('/Volumes', { withFileTypes: true });

      return entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => ({
          name: entry.name,
          path: path.join('/Volumes', entry.name),
        }));
    } catch {
      return [];
    }
  }
}

export function createFilesystemService(): FilesystemService {
  if (process.platform === 'win32') {
    return new WindowsFilesystemService();
  }

  return new UnixFilesystemService();
}

const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.xml', '.yaml', '.yml', '.toml',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.pyw', '.pyi',
  '.rb', '.rake', '.gemspec',
  '.java', '.kt', '.kts', '.scala', '.groovy',
  '.c', '.h', '.cpp', '.hpp', '.cc', '.hh', '.cxx', '.hxx',
  '.cs', '.fs', '.fsx',
  '.go', '.rs', '.swift', '.m', '.mm',
  '.php', '.phtml',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.sql', '.graphql', '.gql',
  '.sh', '.bash', '.zsh', '.fish', '.bat', '.cmd', '.ps1',
  '.lua', '.vim', '.el', '.clj', '.cljs', '.edn',
  '.r', '.R', '.rmd', '.Rmd',
  '.pl', '.pm', '.perl',
  '.ex', '.exs', '.erl', '.hrl',
  '.hs', '.lhs', '.elm',
  '.vue', '.svelte', '.astro',
  '.env', '.env.local', '.env.development', '.env.production',
  '.gitignore', '.gitattributes', '.editorconfig', '.prettierrc', '.eslintrc',
  '.dockerfile', '.dockerignore',
  '.makefile', '.cmake',
  '.ini', '.cfg', '.conf', '.config',
  '.log', '.csv', '.tsv',
  '.rst', '.tex', '.bib',
]);

function handleDrives(service: FilesystemService, res: Response): void {
  service
    .listDrives()
    .then((drives) => res.json(drives))
    .catch(() => res.status(500).json({ error: 'Failed to list drives' }));
}

function handleBrowse(service: FilesystemService, dirPath: string, res: Response): void {
  service
    .listDirectory(dirPath)
    .then((entries) => res.json(entries))
    .catch(() => res.status(500).json({ error: 'Failed to list directory' }));
}

function handleReadFile(service: FilesystemService, filePath: string, res: Response): void {
  service
    .readFile(filePath)
    .then((content) => res.json({ content }))
    .catch(() => res.status(404).json({ error: 'Failed to read file' }));
}

function handleBrowseWithFiles(service: FilesystemService, dirPath: string, res: Response): void {
  service
    .listDirectoryWithFiles(dirPath)
    .then((entries) => {
      const entriesWithEditable = entries.map((entry) => ({
        ...entry,
        isEditable: !entry.isDirectory && service.isTextFile(entry.path),
      }));
      res.json(entriesWithEditable);
    })
    .catch(() => res.status(500).json({ error: 'Failed to list directory' }));
}

function handleWriteFile(
  service: FilesystemService,
  filePath: string,
  content: string,
  res: Response
): void {
  service
    .writeFile(filePath, content)
    .then(() => res.json({ success: true }))
    .catch(() => res.status(500).json({ error: 'Failed to write file' }));
}

function handleDelete(
  service: FilesystemService,
  targetPath: string,
  isDirectory: boolean,
  res: Response
): void {
  const deletePromise = isDirectory
    ? service.deleteDirectory(targetPath)
    : service.deleteFile(targetPath);

  deletePromise
    .then(() => res.json({ success: true }))
    .catch(() => res.status(500).json({ error: 'Failed to delete' }));
}

function handleCreateDirectory(
  service: FilesystemService,
  dirPath: string,
  res: Response
): void {
  service
    .createDirectory(dirPath)
    .then(() => res.json({ success: true }))
    .catch((err: Error) => {
      if (err.message.includes('EEXIST')) {
        res.status(409).json({ error: 'Folder already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create folder' });
      }
    });
}

export function createFilesystemRouter(service: FilesystemService): Router {
  const router = Router();

  router.get('/drives', (_req: Request, res: Response) => {
    handleDrives(service, res);
  });

  router.get('/browse', (req: Request, res: Response) => {
    const dirPath = req.query['path'] as string;

    if (!dirPath) {
      res.status(400).json({ error: 'Path parameter is required' });
      return;
    }

    handleBrowse(service, dirPath, res);
  });

  router.get('/read', (req: Request, res: Response) => {
    const filePath = req.query['path'] as string;

    if (!filePath) {
      res.status(400).json({ error: 'Path parameter is required' });
      return;
    }

    handleReadFile(service, filePath, res);
  });

  router.get('/browse-with-files', (req: Request, res: Response) => {
    const dirPath = req.query['path'] as string;

    if (!dirPath) {
      res.status(400).json({ error: 'Path parameter is required' });
      return;
    }

    handleBrowseWithFiles(service, dirPath, res);
  });

  router.put('/write', (req: Request, res: Response) => {
    const body = req.body as { path?: string; content?: string };
    const filePath = body.path;
    const content = body.content;

    if (!filePath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    if (content === undefined) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    handleWriteFile(service, filePath, content, res);
  });

  router.delete('/delete', (req: Request, res: Response) => {
    const body = req.body as { path?: string; isDirectory?: boolean };
    const targetPath = body.path;
    const isDirectory = body.isDirectory;

    if (!targetPath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    handleDelete(service, targetPath, isDirectory === true, res);
  });

  router.post('/mkdir', (req: Request, res: Response) => {
    const body = req.body as { path?: string };
    const dirPath = body.path;

    if (!dirPath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    handleCreateDirectory(service, dirPath, res);
  });

  return router;
}
