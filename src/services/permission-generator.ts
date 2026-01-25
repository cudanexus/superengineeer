import { ClaudePermissions } from '../repositories/settings';
import { ProjectPermissionOverrides } from '../repositories/project';

export interface PermissionArgs {
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode?: 'acceptEdits' | 'plan';
  skipPermissions: boolean;
}

export interface PermissionGenerator {
  generateArgs(permissions: ClaudePermissions, projectOverrides?: ProjectPermissionOverrides | null): PermissionArgs;
  buildCliArgs(permissions: ClaudePermissions, projectOverrides?: ProjectPermissionOverrides | null): string[];
}

export class DefaultPermissionGenerator implements PermissionGenerator {
  generateArgs(permissions: ClaudePermissions, projectOverrides?: ProjectPermissionOverrides | null): PermissionArgs {
    if (permissions.dangerouslySkipPermissions) {
      return {
        allowedTools: [],
        disallowedTools: [],
        skipPermissions: true,
      };
    }

    // Start with global rules
    let allowRules = [...permissions.allowRules];
    let denyRules = [...permissions.denyRules];
    let defaultMode = permissions.defaultMode;

    // Apply project overrides if enabled
    if (projectOverrides?.enabled) {
      if (projectOverrides.allowRules && projectOverrides.allowRules.length > 0) {
        allowRules = this.mergeRules(allowRules, projectOverrides.allowRules);
      }

      if (projectOverrides.denyRules && projectOverrides.denyRules.length > 0) {
        denyRules = this.mergeRules(denyRules, projectOverrides.denyRules);
      }

      if (projectOverrides.defaultMode) {
        defaultMode = projectOverrides.defaultMode;
      }
    }

    const allowedTools = this.combineRules(allowRules, permissions.allowedTools);
    const disallowedTools = [...denyRules];

    return {
      allowedTools,
      disallowedTools,
      permissionMode: defaultMode,
      skipPermissions: false,
    };
  }

  buildCliArgs(permissions: ClaudePermissions, projectOverrides?: ProjectPermissionOverrides | null): string[] {
    const args: string[] = [];
    const permArgs = this.generateArgs(permissions, projectOverrides);

    if (permArgs.skipPermissions) {
      args.push('--dangerously-skip-permissions');
      return args;
    }

    if (permArgs.permissionMode) {
      args.push('--permission-mode', permArgs.permissionMode);
    }

    if (permArgs.allowedTools.length > 0) {
      // Claude CLI expects tools as a single space-separated string
      args.push('--allowedTools', permArgs.allowedTools.join(' '));
    }

    if (permArgs.disallowedTools.length > 0) {
      // Claude CLI expects tools as a single space-separated string
      args.push('--disallowedTools', permArgs.disallowedTools.join(' '));
    }

    return args;
  }

  private combineRules(allowRules: string[], legacyAllowedTools: string[]): string[] {
    const combined = new Set<string>();

    for (const rule of allowRules) {
      combined.add(rule);
    }

    for (const tool of legacyAllowedTools) {
      combined.add(tool);
    }

    return Array.from(combined);
  }

  private mergeRules(globalRules: string[], projectRules: string[]): string[] {
    const combined = new Set<string>();

    for (const rule of globalRules) {
      combined.add(rule);
    }

    for (const rule of projectRules) {
      combined.add(rule);
    }

    return Array.from(combined);
  }
}
