import { DefaultPermissionGenerator } from '../../../src/services/permission-generator';
import { ClaudePermissions, McpServerConfig } from '../../../src/repositories/settings';
import { ProjectPermissionOverrides } from '../../../src/repositories/project';

describe('DefaultPermissionGenerator', () => {
  let generator: DefaultPermissionGenerator;

  beforeEach(() => {
    generator = new DefaultPermissionGenerator();
  });

  function createPermissions(overrides?: Partial<ClaudePermissions>): ClaudePermissions {
    return {
      dangerouslySkipPermissions: false,
      allowedTools: [],
      defaultMode: 'acceptEdits',
      allowRules: [],
      denyRules: [],
      askRules: [],
      ...overrides,
    };
  }

  describe('generateArgs', () => {
    describe('with dangerouslySkipPermissions', () => {
      it('should return skip permissions flag when enabled', () => {
        const permissions = createPermissions({
          dangerouslySkipPermissions: true,
        });

        const result = generator.generateArgs(permissions);

        expect(result.skipPermissions).toBe(true);
        expect(result.allowedTools).toEqual([]);
        expect(result.disallowedTools).toEqual([]);
      });

      it('should ignore other rules when skip permissions is enabled', () => {
        const permissions = createPermissions({
          dangerouslySkipPermissions: true,
          allowRules: ['Read', 'Write'],
          denyRules: ['Bash(rm:*)'],
        });

        const result = generator.generateArgs(permissions);

        expect(result.skipPermissions).toBe(true);
        expect(result.allowedTools).toEqual([]);
        expect(result.disallowedTools).toEqual([]);
      });

      it('should not skip permissions when mode is plan', () => {
        const permissions = createPermissions({
          dangerouslySkipPermissions: true,
          defaultMode: 'plan',
          allowRules: ['Read'],
        });

        const result = generator.generateArgs(permissions);

        expect(result.skipPermissions).toBe(false);
        expect(result.permissionMode).toBe('plan');
        expect(result.allowedTools).toContain('Read');
      });

      it('should not skip permissions when project overrides mode to plan', () => {
        const permissions = createPermissions({
          dangerouslySkipPermissions: true,
          defaultMode: 'acceptEdits',
        });
        const projectOverrides: ProjectPermissionOverrides = {
          enabled: true,
          defaultMode: 'plan',
        };

        const result = generator.generateArgs(permissions, projectOverrides);

        expect(result.skipPermissions).toBe(false);
        expect(result.permissionMode).toBe('plan');
      });
    });

    describe('with global rules only', () => {
      it('should include allow rules in allowedTools', () => {
        const permissions = createPermissions({
          allowRules: ['Read', 'Write', 'Bash(npm:*)'],
        });

        const result = generator.generateArgs(permissions);

        expect(result.allowedTools).toContain('Read');
        expect(result.allowedTools).toContain('Write');
        expect(result.allowedTools).toContain('Bash(npm:*)');
        expect(result.skipPermissions).toBe(false);
      });

      it('should include deny rules in disallowedTools', () => {
        const permissions = createPermissions({
          denyRules: ['Bash(rm -rf:*)', 'Read(.env)'],
        });

        const result = generator.generateArgs(permissions);

        expect(result.disallowedTools).toContain('Bash(rm -rf:*)');
        expect(result.disallowedTools).toContain('Read(.env)');
      });

      it('should include permission mode', () => {
        const permissions = createPermissions({
          defaultMode: 'plan',
        });

        const result = generator.generateArgs(permissions);

        expect(result.permissionMode).toBe('plan');
      });

      it('should combine allowRules with legacy allowedTools', () => {
        const permissions = createPermissions({
          allowRules: ['Read'],
          allowedTools: ['Write', 'Edit'],
        });

        const result = generator.generateArgs(permissions);

        expect(result.allowedTools).toContain('Read');
        expect(result.allowedTools).toContain('Write');
        expect(result.allowedTools).toContain('Edit');
      });

      it('should deduplicate combined rules', () => {
        const permissions = createPermissions({
          allowRules: ['Read', 'Write'],
          allowedTools: ['Read', 'Edit'],
        });

        const result = generator.generateArgs(permissions);

        const readCount = result.allowedTools.filter((t) => t === 'Read').length;
        expect(readCount).toBe(1);
      });
    });

    describe('with project overrides', () => {
      it('should merge project allow rules with global', () => {
        const permissions = createPermissions({
          allowRules: ['Read'],
        });
        const projectOverrides: ProjectPermissionOverrides = {
          enabled: true,
          allowRules: ['Write', 'Edit'],
        };

        const result = generator.generateArgs(permissions, projectOverrides);

        expect(result.allowedTools).toContain('Read');
        expect(result.allowedTools).toContain('Write');
        expect(result.allowedTools).toContain('Edit');
      });

      it('should merge project deny rules with global', () => {
        const permissions = createPermissions({
          denyRules: ['Bash(rm:*)'],
        });
        const projectOverrides: ProjectPermissionOverrides = {
          enabled: true,
          denyRules: ['Read(.env)'],
        };

        const result = generator.generateArgs(permissions, projectOverrides);

        expect(result.disallowedTools).toContain('Bash(rm:*)');
        expect(result.disallowedTools).toContain('Read(.env)');
      });

      it('should override default mode from project', () => {
        const permissions = createPermissions({
          defaultMode: 'acceptEdits',
        });
        const projectOverrides: ProjectPermissionOverrides = {
          enabled: true,
          defaultMode: 'plan',
        };

        const result = generator.generateArgs(permissions, projectOverrides);

        expect(result.permissionMode).toBe('plan');
      });

      it('should not apply overrides when not enabled', () => {
        const permissions = createPermissions({
          allowRules: ['Read'],
          defaultMode: 'acceptEdits',
        });
        const projectOverrides: ProjectPermissionOverrides = {
          enabled: false,
          allowRules: ['Write'],
          defaultMode: 'plan',
        };

        const result = generator.generateArgs(permissions, projectOverrides);

        expect(result.allowedTools).not.toContain('Write');
        expect(result.permissionMode).toBe('acceptEdits');
      });

      it('should handle null project overrides', () => {
        const permissions = createPermissions({
          allowRules: ['Read'],
        });

        const result = generator.generateArgs(permissions, null);

        expect(result.allowedTools).toContain('Read');
      });

      it('should handle undefined project overrides', () => {
        const permissions = createPermissions({
          allowRules: ['Read'],
        });

        const result = generator.generateArgs(permissions, undefined);

        expect(result.allowedTools).toContain('Read');
      });

      it('should handle empty project override arrays', () => {
        const permissions = createPermissions({
          allowRules: ['Read'],
          denyRules: ['Write'],
        });
        const projectOverrides: ProjectPermissionOverrides = {
          enabled: true,
          allowRules: [],
          denyRules: [],
        };

        const result = generator.generateArgs(permissions, projectOverrides);

        expect(result.allowedTools).toContain('Read');
        expect(result.disallowedTools).toContain('Write');
      });
    });
  });

  describe('buildCliArgs', () => {
    it('should return skip permissions flag', () => {
      const permissions = createPermissions({
        dangerouslySkipPermissions: true,
      });

      const args = generator.buildCliArgs(permissions);

      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).not.toContain('--allowedTools');
    });

    it('should include permission mode', () => {
      const permissions = createPermissions({
        defaultMode: 'plan',
      });

      const args = generator.buildCliArgs(permissions);

      const modeIndex = args.indexOf('--permission-mode');
      expect(modeIndex).toBeGreaterThanOrEqual(0);
      expect(args[modeIndex + 1]).toBe('plan');
    });

    it('should include allowed tools as space-separated string', () => {
      const permissions = createPermissions({
        allowRules: ['Read', 'Write', 'Edit'],
      });

      const args = generator.buildCliArgs(permissions);

      const toolsIndex = args.indexOf('--allowedTools');
      expect(toolsIndex).toBeGreaterThanOrEqual(0);
      expect(args[toolsIndex + 1]).toBe('Read Write Edit');
    });

    it('should include disallowed tools as space-separated string', () => {
      const permissions = createPermissions({
        denyRules: ['Bash(rm:*)', 'Read(.env)'],
      });

      const args = generator.buildCliArgs(permissions);

      const toolsIndex = args.indexOf('--disallowedTools');
      expect(toolsIndex).toBeGreaterThanOrEqual(0);
      expect(args[toolsIndex + 1]).toBe('Bash(rm:*) Read(.env)');
    });

    it('should not include empty tool lists', () => {
      const permissions = createPermissions();

      const args = generator.buildCliArgs(permissions);

      expect(args).not.toContain('--allowedTools');
      expect(args).not.toContain('--disallowedTools');
    });

    it('should apply project overrides to CLI args', () => {
      const permissions = createPermissions({
        defaultMode: 'acceptEdits',
      });
      const projectOverrides: ProjectPermissionOverrides = {
        enabled: true,
        defaultMode: 'plan',
        allowRules: ['Read'],
      };

      const args = generator.buildCliArgs(permissions, projectOverrides);

      const modeIndex = args.indexOf('--permission-mode');
      expect(args[modeIndex + 1]).toBe('plan');
      expect(args).toContain('--allowedTools');
    });
  });

  describe('generateMcpAllowRules', () => {
    it('should generate wildcard rules for enabled servers with autoApproveTools', () => {
      const servers: McpServerConfig[] = [
        { id: '1', name: 'filesystem', enabled: true, type: 'stdio', command: 'fs', autoApproveTools: true },
        { id: '2', name: 'github', enabled: true, type: 'http', url: 'http://test', autoApproveTools: true },
      ];

      const rules = generator.generateMcpAllowRules(servers);

      expect(rules).toContain('mcp__filesystem__*');
      expect(rules).toContain('mcp__github__*');
    });

    it('should skip disabled servers', () => {
      const servers: McpServerConfig[] = [
        { id: '1', name: 'filesystem', enabled: false, type: 'stdio', command: 'fs', autoApproveTools: true },
        { id: '2', name: 'github', enabled: true, type: 'http', url: 'http://test', autoApproveTools: true },
      ];

      const rules = generator.generateMcpAllowRules(servers);

      expect(rules).not.toContain('mcp__filesystem__*');
      expect(rules).toContain('mcp__github__*');
    });

    it('should skip servers with autoApproveTools false', () => {
      const servers: McpServerConfig[] = [
        { id: '1', name: 'filesystem', enabled: true, type: 'stdio', command: 'fs', autoApproveTools: false },
        { id: '2', name: 'github', enabled: true, type: 'http', url: 'http://test', autoApproveTools: true },
      ];

      const rules = generator.generateMcpAllowRules(servers);

      expect(rules).not.toContain('mcp__filesystem__*');
      expect(rules).toContain('mcp__github__*');
    });

    it('should treat undefined autoApproveTools as true', () => {
      const servers: McpServerConfig[] = [
        { id: '1', name: 'filesystem', enabled: true, type: 'stdio', command: 'fs' },
      ];

      const rules = generator.generateMcpAllowRules(servers);

      expect(rules).toContain('mcp__filesystem__*');
    });

    it('should handle empty server list', () => {
      const rules = generator.generateMcpAllowRules([]);
      expect(rules).toEqual([]);
    });

    it('should be included in generateArgs when mcpServers provided', () => {
      const permissions = createPermissions({ allowRules: ['Read'] });
      const servers: McpServerConfig[] = [
        { id: '1', name: 'filesystem', enabled: true, type: 'stdio', command: 'fs' },
      ];

      const result = generator.generateArgs(permissions, null, servers);

      expect(result.allowedTools).toContain('Read');
      expect(result.allowedTools).toContain('mcp__filesystem__*');
    });
  });
});
