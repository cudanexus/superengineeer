/**
 * Tests for ApiClient module
 */

const ApiClient = require('../../public/js/modules/api-client.js');

describe('ApiClient', () => {
  let mockAjax, mockGet, mockPost;

  beforeEach(() => {
    // Reset base URL
    ApiClient.setBaseUrl('');

    // Create mock jQuery methods
    mockAjax = jest.fn().mockReturnValue({ done: jest.fn().mockReturnThis(), fail: jest.fn() });
    mockGet = jest.fn().mockReturnValue({ done: jest.fn().mockReturnThis(), fail: jest.fn() });
    mockPost = jest.fn().mockReturnValue({ done: jest.fn().mockReturnThis(), fail: jest.fn() });

    global.$ = {
      ajax: mockAjax,
      get: mockGet,
      post: mockPost
    };
  });

  afterEach(() => {
    delete global.$;
  });

  describe('setBaseUrl / getBaseUrl', () => {
    it('should set and get base URL', () => {
      ApiClient.setBaseUrl('http://localhost:3000');
      expect(ApiClient.getBaseUrl()).toBe('http://localhost:3000');
    });

    it('should default to empty string', () => {
      ApiClient.setBaseUrl('');
      expect(ApiClient.getBaseUrl()).toBe('');
    });

    it('should handle null by setting empty string', () => {
      ApiClient.setBaseUrl(null);
      expect(ApiClient.getBaseUrl()).toBe('');
    });
  });

  describe('Health & System', () => {
    it('getHealth should call correct endpoint', () => {
      ApiClient.getHealth();
      expect(mockGet).toHaveBeenCalledWith('/api/health');
    });

    it('getDevStatus should call correct endpoint', () => {
      ApiClient.getDevStatus();
      expect(mockGet).toHaveBeenCalledWith('/api/dev');
    });

    it('shutdownServer should POST to correct endpoint', () => {
      ApiClient.shutdownServer();
      expect(mockPost).toHaveBeenCalledWith('/api/dev/shutdown');
    });

    it('getAgentResourceStatus should call correct endpoint', () => {
      ApiClient.getAgentResourceStatus();
      expect(mockGet).toHaveBeenCalledWith('/api/agents/status');
    });
  });

  describe('Projects', () => {
    it('getProjects should call correct endpoint', () => {
      ApiClient.getProjects();
      expect(mockGet).toHaveBeenCalledWith('/api/projects');
    });

    it('addProject should POST with data', () => {
      const data = { name: 'Test', path: '/test' };
      ApiClient.addProject(data);
      expect(mockPost).toHaveBeenCalledWith('/api/projects', data);
    });

    it('deleteProject should use DELETE method', () => {
      ApiClient.deleteProject('proj-123');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123',
        method: 'DELETE'
      });
    });

    it('getDebugInfo should call correct endpoint with project ID', () => {
      ApiClient.getDebugInfo('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/debug');
    });
  });

  describe('Roadmap', () => {
    it('getProjectRoadmap should call correct endpoint', () => {
      ApiClient.getProjectRoadmap('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/roadmap');
    });

    it('generateRoadmap should POST with prompt', () => {
      ApiClient.generateRoadmap('proj-123', 'Generate a roadmap');
      expect(mockPost).toHaveBeenCalledWith('/api/projects/proj-123/roadmap/generate', { prompt: 'Generate a roadmap' });
    });

    it('modifyRoadmap should PUT with JSON payload', () => {
      ApiClient.modifyRoadmap('proj-123', 'Modify prompt');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/roadmap',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ prompt: 'Modify prompt' })
      });
    });

    it('deleteRoadmapTask should DELETE with task details', () => {
      ApiClient.deleteRoadmapTask('proj-123', 'phase-1', 'milestone-1', 2);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/roadmap/task',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ phaseId: 'phase-1', milestoneId: 'milestone-1', taskIndex: 2 })
      });
    });

    it('deleteRoadmapMilestone should DELETE with milestone details', () => {
      ApiClient.deleteRoadmapMilestone('proj-123', 'phase-1', 'milestone-1');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/roadmap/milestone',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ phaseId: 'phase-1', milestoneId: 'milestone-1' })
      });
    });

    it('deleteRoadmapPhase should DELETE with phase ID', () => {
      ApiClient.deleteRoadmapPhase('proj-123', 'phase-1');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/roadmap/phase',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ phaseId: 'phase-1' })
      });
    });
  });

  describe('Agent', () => {
    it('startAgent should POST to correct endpoint', () => {
      ApiClient.startAgent('proj-123');
      expect(mockPost).toHaveBeenCalledWith('/api/projects/proj-123/agent/start');
    });

    it('stopAgent should POST to correct endpoint', () => {
      ApiClient.stopAgent('proj-123');
      expect(mockPost).toHaveBeenCalledWith('/api/projects/proj-123/agent/stop');
    });

    it('stopOneOffAgent should POST to correct endpoint', () => {
      ApiClient.stopOneOffAgent('proj-123', 'oneoff-abc-123');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/oneoff/oneoff-abc-123/stop',
        method: 'POST'
      });
    });

    it('sendOneOffMessage should POST to correct endpoint', () => {
      ApiClient.sendOneOffMessage('proj-123', 'oneoff-abc-123', 'hello');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/oneoff/oneoff-abc-123/send',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: 'hello' })
      });
    });

    it('sendOneOffMessage should include images when provided', () => {
      var images = [{ id: 'img1', dataUrl: 'data:image/png;base64,abc', mimeType: 'image/png', size: 100 }];
      ApiClient.sendOneOffMessage('proj-123', 'oneoff-abc-123', 'hello', images);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/oneoff/oneoff-abc-123/send',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: 'hello', images: [{ type: 'image/png', data: 'abc' }] })
      });
    });

    it('getOneOffStatus should GET correct endpoint', () => {
      ApiClient.getOneOffStatus('proj-123', 'oneoff-abc-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/agent/oneoff/oneoff-abc-123/status');
    });

    it('getOneOffContext should GET correct endpoint', () => {
      ApiClient.getOneOffContext('proj-123', 'oneoff-abc-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/agent/oneoff/oneoff-abc-123/context');
    });

    it('getAgentStatus should GET correct endpoint', () => {
      ApiClient.getAgentStatus('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/agent/status');
    });

    it('getLoopStatus should GET correct endpoint', () => {
      ApiClient.getLoopStatus('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/agent/loop');
    });

    it('getContextUsage should GET correct endpoint', () => {
      ApiClient.getContextUsage('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/agent/context');
    });

    it('startInteractiveAgent should POST with message', () => {
      ApiClient.startInteractiveAgent('proj-123', 'Hello');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/interactive',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: 'Hello' })
      });
    });

    it('startInteractiveAgent should include sessionId if provided', () => {
      ApiClient.startInteractiveAgent('proj-123', 'Hello', null, 'session-456');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/interactive',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: 'Hello', sessionId: 'session-456' })
      });
    });

    it('startInteractiveAgent should include permissionMode if provided', () => {
      ApiClient.startInteractiveAgent('proj-123', 'Hello', null, null, 'plan');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/interactive',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: 'Hello', permissionMode: 'plan' })
      });
    });

    it('startInteractiveAgent should process images correctly', () => {
      const images = [
        { mimeType: 'image/png', dataUrl: 'data:image/png;base64,ABC123' }
      ];
      ApiClient.startInteractiveAgent('proj-123', 'See this image', images);

      const call = mockAjax.mock.calls[0][0];
      const payload = JSON.parse(call.data);
      expect(payload.images).toEqual([{ type: 'image/png', data: 'ABC123' }]);
    });

    it('sendAgentMessage should POST with message', () => {
      ApiClient.sendAgentMessage('proj-123', 'Test message');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/send',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: 'Test message' })
      });
    });

    it('sendAgentMessage should process images correctly', () => {
      const images = [
        { mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,XYZ789' }
      ];
      ApiClient.sendAgentMessage('proj-123', 'With image', images);

      const call = mockAjax.mock.calls[0][0];
      const payload = JSON.parse(call.data);
      expect(payload.images).toEqual([{ type: 'image/jpeg', data: 'XYZ789' }]);
    });
  });

  describe('Queue', () => {
    it('getQueuedMessages should GET correct endpoint', () => {
      ApiClient.getQueuedMessages('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/agent/queue');
    });

    it('removeFromQueue should DELETE correct endpoint', () => {
      ApiClient.removeFromQueue('proj-123');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/queue',
        method: 'DELETE'
      });
    });

    it('removeQueuedMessage should DELETE with index', () => {
      ApiClient.removeQueuedMessage('proj-123', 5);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/agent/queue/5',
        method: 'DELETE'
      });
    });
  });

  describe('Conversations', () => {
    it('getConversations should GET correct endpoint', () => {
      ApiClient.getConversations('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/conversations');
    });

    it('getConversation should GET with conversationId', () => {
      ApiClient.getConversation('proj-123', 'conv-456');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/conversation', { conversationId: 'conv-456' });
    });

    it('searchConversationHistory should GET with query', () => {
      ApiClient.searchConversationHistory('proj-123', 'search term');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/conversations/search', { q: 'search term' });
    });

    it('renameConversation should PUT with label', () => {
      ApiClient.renameConversation('proj-123', 'conv-456', 'New Label');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/conversations/conv-456',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ label: 'New Label' })
      });
    });

    it('setCurrentConversation should PUT with conversationId', () => {
      ApiClient.setCurrentConversation('proj-123', 'conv-456');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/conversation/current',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ conversationId: 'conv-456' })
      });
    });
  });

  describe('Claude Files', () => {
    it('getClaudeFiles should GET correct endpoint', () => {
      ApiClient.getClaudeFiles('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/claude-files');
    });

    it('saveClaudeFile should PUT with file data', () => {
      ApiClient.saveClaudeFile('proj-123', '/path/to/CLAUDE.md', '# Content');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/claude-files',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ filePath: '/path/to/CLAUDE.md', content: '# Content' })
      });
    });

    it('getOptimizations should GET correct endpoint', () => {
      ApiClient.getOptimizations('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/optimizations');
    });
  });

  describe('Settings', () => {
    it('getSettings should GET correct endpoint', () => {
      ApiClient.getSettings();
      expect(mockGet).toHaveBeenCalledWith('/api/settings');
    });

    it('updateSettings should PUT with settings object', () => {
      const settings = { maxConcurrentAgents: 5 };
      ApiClient.updateSettings(settings);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/settings',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(settings)
      });
    });

    it('getAvailableModels should GET correct endpoint', () => {
      ApiClient.getAvailableModels();
      expect(mockGet).toHaveBeenCalledWith('/api/settings/models');
    });
  });

  describe('Project Model', () => {
    it('getProjectModel should GET correct endpoint', () => {
      ApiClient.getProjectModel('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/model');
    });

    it('setProjectModel should PUT with model', () => {
      ApiClient.setProjectModel('proj-123', 'claude-opus-4-6');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/model',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ model: 'claude-opus-4-6' })
      });
    });

    it('setProjectModel should PUT with null to clear override', () => {
      ApiClient.setProjectModel('proj-123', null);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/model',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ model: null })
      });
    });
  });

  describe('Filesystem', () => {
    it('getDrives should GET correct endpoint', () => {
      ApiClient.getDrives();
      expect(mockGet).toHaveBeenCalledWith('/api/fs/drives');
    });

    it('browseFolder should GET with path', () => {
      ApiClient.browseFolder('/home/user');
      expect(mockGet).toHaveBeenCalledWith('/api/fs/browse', { path: '/home/user' });
    });

    it('browseWithFiles should GET with path', () => {
      ApiClient.browseWithFiles('/home/user');
      expect(mockGet).toHaveBeenCalledWith('/api/fs/browse-with-files', { path: '/home/user' });
    });

    it('readFile should GET with path', () => {
      ApiClient.readFile('/path/to/file.txt');
      expect(mockGet).toHaveBeenCalledWith('/api/fs/read', { path: '/path/to/file.txt' });
    });

    it('writeFile should PUT with path and content', () => {
      ApiClient.writeFile('/path/to/file.txt', 'file content');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/fs/write',
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({ path: '/path/to/file.txt', content: 'file content' })
      });
    });

    it('createFolder should POST with path', () => {
      ApiClient.createFolder('/path/to/folder');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/fs/mkdir',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ path: '/path/to/folder' })
      });
    });

    it('deleteFileOrFolder should DELETE with path and isDirectory', () => {
      ApiClient.deleteFileOrFolder('/path/to/item', true);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/fs/delete',
        method: 'DELETE',
        contentType: 'application/json',
        data: JSON.stringify({ path: '/path/to/item', isDirectory: true })
      });
    });
  });

  describe('Git', () => {
    it('getGitStatus should GET correct endpoint', () => {
      ApiClient.getGitStatus('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/git/status');
    });

    it('getGitBranches should GET correct endpoint', () => {
      ApiClient.getGitBranches('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/git/branches');
    });

    it('getGitDiff should GET with staged parameter', () => {
      ApiClient.getGitDiff('proj-123', true);
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/git/diff', { staged: 'true' });

      ApiClient.getGitDiff('proj-123', false);
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/git/diff', { staged: 'false' });
    });

    it('getGitFileDiff should GET with path and staged', () => {
      ApiClient.getGitFileDiff('proj-123', 'src/file.js', true);
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/git/file-diff', {
        path: 'src/file.js',
        staged: 'true'
      });
    });

    it('getGitTags should GET correct endpoint', () => {
      ApiClient.getGitTags('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/git/tags');
    });

    it('gitStage should POST with paths', () => {
      ApiClient.gitStage('proj-123', ['file1.js', 'file2.js']);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/stage',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ paths: ['file1.js', 'file2.js'] })
      });
    });

    it('gitStageAll should POST to correct endpoint', () => {
      ApiClient.gitStageAll('proj-123');
      expect(mockPost).toHaveBeenCalledWith('/api/projects/proj-123/git/stage-all');
    });

    it('gitUnstage should POST with paths', () => {
      ApiClient.gitUnstage('proj-123', ['file1.js']);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/unstage',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ paths: ['file1.js'] })
      });
    });

    it('gitCommit should POST with message', () => {
      ApiClient.gitCommit('proj-123', 'Commit message');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/commit',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: 'Commit message' })
      });
    });

    it('gitCreateBranch should POST with name and checkout flag', () => {
      ApiClient.gitCreateBranch('proj-123', 'feature-branch', true);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/branch',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name: 'feature-branch', checkout: true })
      });
    });

    it('gitCheckout should POST with branch name', () => {
      ApiClient.gitCheckout('proj-123', 'main');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/checkout',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ branch: 'main' })
      });
    });

    it('gitPush should POST with remote, branch, and setUpstream', () => {
      ApiClient.gitPush('proj-123', 'origin', 'main', true);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/push',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ remote: 'origin', branch: 'main', setUpstream: true })
      });
    });

    it('gitPull should POST with remote and branch', () => {
      ApiClient.gitPull('proj-123', 'origin', 'main');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/pull',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ remote: 'origin', branch: 'main' })
      });
    });

    it('gitDiscard should POST with paths', () => {
      ApiClient.gitDiscard('proj-123', ['file.js']);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/discard',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ paths: ['file.js'] })
      });
    });

    it('gitCreateTag should POST with name and message', () => {
      ApiClient.gitCreateTag('proj-123', 'v1.0.0', 'Release version 1.0.0');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/tags',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name: 'v1.0.0', message: 'Release version 1.0.0' })
      });
    });

    it('gitPushTag should POST with correct URL and remote', () => {
      ApiClient.gitPushTag('proj-123', 'v1.0.0', 'origin');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/git/tags/v1.0.0/push',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ remote: 'origin' })
      });
    });

    it('gitPushTag should URL-encode tag name', () => {
      ApiClient.gitPushTag('proj-123', 'v1.0.0-beta.1', 'origin');
      expect(mockAjax).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/projects/proj-123/git/tags/v1.0.0-beta.1/push'
        })
      );
    });
  });

  describe('Ralph Loop', () => {
    it('startRalphLoop should POST with config', () => {
      const config = {
        taskDescription: 'Implement feature X',
        maxTurns: 5,
        workerModel: 'claude-opus-4-6',
        reviewerModel: 'claude-sonnet-4-5-20250929'
      };
      ApiClient.startRalphLoop('proj-123', config);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/ralph-loop/start',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(config)
      });
    });

    it('startRalphLoop should work with minimal config', () => {
      const config = { taskDescription: 'Simple task' };
      ApiClient.startRalphLoop('proj-123', config);
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/ralph-loop/start',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(config)
      });
    });

    it('stopRalphLoop should POST to correct endpoint', () => {
      ApiClient.stopRalphLoop('proj-123', 'task-456');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/ralph-loop/task-456/stop',
        method: 'POST'
      });
    });

    it('pauseRalphLoop should POST to correct endpoint', () => {
      ApiClient.pauseRalphLoop('proj-123', 'task-456');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/ralph-loop/task-456/pause',
        method: 'POST'
      });
    });

    it('resumeRalphLoop should POST to correct endpoint', () => {
      ApiClient.resumeRalphLoop('proj-123', 'task-456');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/ralph-loop/task-456/resume',
        method: 'POST'
      });
    });

    it('getRalphLoops should GET correct endpoint', () => {
      ApiClient.getRalphLoops('proj-123');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/ralph-loop');
    });

    it('getRalphLoopState should GET correct endpoint with taskId', () => {
      ApiClient.getRalphLoopState('proj-123', 'task-456');
      expect(mockGet).toHaveBeenCalledWith('/api/projects/proj-123/ralph-loop/task-456');
    });

    it('deleteRalphLoop should DELETE correct endpoint', () => {
      ApiClient.deleteRalphLoop('proj-123', 'task-456');
      expect(mockAjax).toHaveBeenCalledWith({
        url: '/api/projects/proj-123/ralph-loop/task-456',
        method: 'DELETE'
      });
    });
  });

  describe('Error Logging', () => {
    it('logFrontendError should POST error data', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10';

      ApiClient.logFrontendError('Error message', 'test.js', 10, 5, error, 'proj-123');

      const call = mockAjax.mock.calls[0][0];
      expect(call.url).toBe('/api/log/error');
      expect(call.method).toBe('POST');
      expect(call.contentType).toBe('application/json');

      const payload = JSON.parse(call.data);
      expect(payload.message).toBe('Error message');
      expect(payload.source).toBe('test.js');
      expect(payload.line).toBe(10);
      expect(payload.column).toBe(5);
      expect(payload.stack).toBe('Error: Test error\n    at test.js:10');
      expect(payload.projectId).toBe('proj-123');
      expect(payload.userAgent).toBeDefined(); // jsdom provides its own userAgent
    });

    it('logFrontendError should handle null error object', () => {
      global.navigator = { userAgent: 'Test Browser' };

      ApiClient.logFrontendError('Error message', 'test.js', 10, 5, null, 'proj-123');

      const call = mockAjax.mock.calls[0][0];
      const payload = JSON.parse(call.data);
      expect(payload.stack).toBe(null);

      delete global.navigator;
    });
  });

  describe('Base URL handling', () => {
    it('should prepend base URL to all endpoints', () => {
      ApiClient.setBaseUrl('http://localhost:3000');

      ApiClient.getHealth();
      expect(mockGet).toHaveBeenCalledWith('http://localhost:3000/api/health');

      ApiClient.getProjects();
      expect(mockGet).toHaveBeenCalledWith('http://localhost:3000/api/projects');

      ApiClient.stopAgent('proj-123');
      expect(mockPost).toHaveBeenCalledWith('http://localhost:3000/api/projects/proj-123/agent/stop');
    });
  });
});
