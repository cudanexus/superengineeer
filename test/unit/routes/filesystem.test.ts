/* eslint-disable @typescript-eslint/unbound-method */
import request from 'supertest';
import express, { Express } from 'express';
import { createFilesystemRouter, FilesystemService } from '../../../src/routes/filesystem';
import {
  createMockFilesystemService,
  sampleDrives,
  sampleDirectoryEntries,
  sampleFileContent,
} from '../helpers/mock-factories';

interface DirectoryEntryWithEditable {
  name: string;
  path: string;
  isDirectory: boolean;
  isEditable: boolean;
}

describe('FilesystemRouter', () => {
  let mockService: jest.Mocked<FilesystemService>;
  let app: Express;

  beforeEach(() => {
    mockService = createMockFilesystemService();
    app = express();
    app.use(express.json());
    app.use('/fs', createFilesystemRouter(mockService));
  });

  describe('GET /fs/drives', () => {
    it('should return list of drives', async () => {
      mockService.listDrives.mockResolvedValue(sampleDrives);

      const response = await request(app).get('/fs/drives');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sampleDrives);
      expect(mockService.listDrives).toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      mockService.listDrives.mockRejectedValue(new Error('Failed'));

      const response = await request(app).get('/fs/drives');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to list drives' });
    });
  });

  describe('GET /fs/browse', () => {
    it('should return directory entries when path provided', async () => {
      const dirEntries = sampleDirectoryEntries.filter((e) => e.isDirectory);
      mockService.listDirectory.mockResolvedValue(dirEntries);

      const response = await request(app).get('/fs/browse').query({ path: '/project' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(dirEntries);
      expect(mockService.listDirectory).toHaveBeenCalledWith('/project');
    });

    it('should return 400 when path not provided', async () => {
      const response = await request(app).get('/fs/browse');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Path parameter is required' });
    });

    it('should return 500 on service error', async () => {
      mockService.listDirectory.mockRejectedValue(new Error('Access denied'));

      const response = await request(app).get('/fs/browse').query({ path: '/restricted' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to list directory' });
    });
  });

  describe('GET /fs/browse-with-files', () => {
    it('should return entries with isEditable flag', async () => {
      mockService.listDirectoryWithFiles.mockResolvedValue(sampleDirectoryEntries);
      mockService.isTextFile.mockImplementation((path) =>
        path.endsWith('.json') || path.endsWith('.md')
      );

      const response = await request(app).get('/fs/browse-with-files').query({ path: '/project' });

      expect(response.status).toBe(200);
      expect(mockService.listDirectoryWithFiles).toHaveBeenCalledWith('/project');

      const result = response.body as DirectoryEntryWithEditable[];
      expect(result.length).toBe(4);
      // Directories should have isEditable false
      expect(result[0]?.isEditable).toBe(false); // src is directory
      expect(result[1]?.isEditable).toBe(false); // test is directory
      expect(result[2]?.isEditable).toBe(true);  // package.json
      expect(result[3]?.isEditable).toBe(true);  // README.md
    });

    it('should return 400 when path not provided', async () => {
      const response = await request(app).get('/fs/browse-with-files');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Path parameter is required' });
    });

    it('should return 500 on service error', async () => {
      mockService.listDirectoryWithFiles.mockRejectedValue(new Error('Failed'));

      const response = await request(app).get('/fs/browse-with-files').query({ path: '/project' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to list directory' });
    });
  });

  describe('GET /fs/read', () => {
    it('should return file content', async () => {
      mockService.readFile.mockResolvedValue(sampleFileContent);

      const response = await request(app).get('/fs/read').query({ path: '/project/index.ts' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ content: sampleFileContent });
      expect(mockService.readFile).toHaveBeenCalledWith('/project/index.ts');
    });

    it('should return 400 when path not provided', async () => {
      const response = await request(app).get('/fs/read');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Path parameter is required' });
    });

    it('should return 404 on read error', async () => {
      mockService.readFile.mockRejectedValue(new Error('ENOENT'));

      const response = await request(app).get('/fs/read').query({ path: '/nonexistent' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Failed to read file' });
    });
  });

  describe('PUT /fs/write', () => {
    it('should write file content', async () => {
      mockService.writeFile.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/fs/write')
        .send({ path: '/project/file.ts', content: 'new content' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockService.writeFile).toHaveBeenCalledWith('/project/file.ts', 'new content');
    });

    it('should return 400 when path not provided', async () => {
      const response = await request(app)
        .put('/fs/write')
        .send({ content: 'content' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Path is required' });
    });

    it('should return 400 when content not provided', async () => {
      const response = await request(app)
        .put('/fs/write')
        .send({ path: '/file.ts' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Content is required' });
    });

    it('should allow empty string as content', async () => {
      mockService.writeFile.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/fs/write')
        .send({ path: '/project/file.ts', content: '' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockService.writeFile).toHaveBeenCalledWith('/project/file.ts', '');
    });

    it('should return 500 on write error', async () => {
      mockService.writeFile.mockRejectedValue(new Error('Permission denied'));

      const response = await request(app)
        .put('/fs/write')
        .send({ path: '/readonly/file.ts', content: 'content' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to write file' });
    });
  });

  describe('DELETE /fs/delete', () => {
    it('should delete a file', async () => {
      mockService.deleteFile.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/fs/delete')
        .send({ path: '/project/file.ts', isDirectory: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockService.deleteFile).toHaveBeenCalledWith('/project/file.ts');
    });

    it('should delete a directory', async () => {
      mockService.deleteDirectory.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/fs/delete')
        .send({ path: '/project/old-folder', isDirectory: true });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockService.deleteDirectory).toHaveBeenCalledWith('/project/old-folder');
    });

    it('should return 400 when path not provided', async () => {
      const response = await request(app).delete('/fs/delete').send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Path is required' });
    });

    it('should return 500 on delete error', async () => {
      mockService.deleteFile.mockRejectedValue(new Error('File in use'));

      const response = await request(app)
        .delete('/fs/delete')
        .send({ path: '/locked/file.ts', isDirectory: false });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete' });
    });

    it('should treat missing isDirectory as false (file)', async () => {
      mockService.deleteFile.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/fs/delete')
        .send({ path: '/project/file.ts' });

      expect(response.status).toBe(200);
      expect(mockService.deleteFile).toHaveBeenCalledWith('/project/file.ts');
      expect(mockService.deleteDirectory).not.toHaveBeenCalled();
    });
  });

  describe('POST /fs/mkdir', () => {
    it('should create a directory', async () => {
      mockService.createDirectory.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/fs/mkdir')
        .send({ path: '/project/new-folder' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockService.createDirectory).toHaveBeenCalledWith('/project/new-folder');
    });

    it('should return 400 when path not provided', async () => {
      const response = await request(app).post('/fs/mkdir').send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Path is required' });
    });

    it('should return 409 when directory already exists', async () => {
      mockService.createDirectory.mockRejectedValue(new Error('EEXIST: directory exists'));

      const response = await request(app)
        .post('/fs/mkdir')
        .send({ path: '/project/existing' });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Folder already exists' });
    });

    it('should return 500 on other creation errors', async () => {
      mockService.createDirectory.mockRejectedValue(new Error('Permission denied'));

      const response = await request(app)
        .post('/fs/mkdir')
        .send({ path: '/restricted/folder' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create folder' });
    });
  });
});
