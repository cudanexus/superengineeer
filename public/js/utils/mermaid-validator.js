/**
 * Mermaid Syntax Validator and Fixer
 * Helps prevent common Mermaid.js syntax errors
 */

class MermaidValidator {
  /**
   * Fix common syntax issues in Mermaid diagrams
   * @param {string} diagramCode - The Mermaid diagram code
   * @returns {string} - Fixed diagram code
   */
  static fixCommonIssues(diagramCode) {
    let fixed = diagramCode;

    // Fix curly braces in node labels (not in decision nodes)
    // Match node definitions like A[text{with}braces]
    fixed = fixed.replace(/(\w+)\[([^\]]*)\{([^\}]*)\}([^\]]*)\]/g, (match, nodeId, before, inside, after) => {
      // Don't replace if it's a decision node syntax
      if (match.includes('{Decision}')) {
        return match;
      }
      return `${nodeId}[${before}[${inside}]${after}]`;
    });

    // Fix quotes in subgraph names
    fixed = fixed.replace(/subgraph\s*"([^"]+)"/g, (match, name) => {
      const id = name.replace(/\s+/g, '');
      return `subgraph ${id} [${name}]`;
    });

    // Fix angle brackets in labels
    fixed = fixed.replace(/\[([^\]]*)<([^>]*)>([^\]]*)\]/g, '[$1$2$3]');

    // Fix Windows-style paths (backslashes)
    fixed = fixed.replace(/\[([^\]]*[A-Za-z]:\\[^\]]+)\]/g, (match, path) => {
      const fixedPath = path.replace(/\\/g, '/');
      return `[${fixedPath}]`;
    });

    return fixed;
  }

  /**
   * Validate Mermaid diagram syntax
   * @param {string} diagramCode - The Mermaid diagram code
   * @returns {{valid: boolean, errors: string[]}} - Validation result
   */
  static validate(diagramCode) {
    const errors = [];

    // Check for curly braces in labels (excluding decision nodes)
    const labelBraceMatches = diagramCode.match(/\w+\[[^\]]*\{[^\}]*\}[^\]]*\]/g) || [];
    labelBraceMatches.forEach(match => {
      if (!match.includes('{Decision}')) {
        errors.push(`Curly braces in node label: ${match}`);
      }
    });

    // Check for quoted subgraph names
    if (/subgraph\s*"[^"]+"/g.test(diagramCode)) {
      errors.push('Subgraph names should not be quoted. Use: subgraph ID [Display Name]');
    }

    // Check for angle brackets in labels
    if (/\[[^\]]*[<>][^\]]*\]/g.test(diagramCode)) {
      errors.push('Angle brackets < > in labels should be avoided');
    }

    // Check for unmatched brackets
    const openBrackets = (diagramCode.match(/\[/g) || []).length;
    const closeBrackets = (diagramCode.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push(`Unmatched brackets: ${openBrackets} [ vs ${closeBrackets} ]`);
    }

    // Check for Windows paths
    if (/\[[^\]]*[A-Za-z]:\\[^\]]*\]/g.test(diagramCode)) {
      errors.push('Windows-style paths with backslashes should use forward slashes');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Sanitize a label for use in Mermaid diagrams
   * @param {string} label - The label text
   * @returns {string} - Sanitized label
   */
  static sanitizeLabel(label) {
    // Remove or replace problematic characters
    let sanitized = label;

    // Replace curly braces
    sanitized = sanitized.replace(/\{/g, '[').replace(/\}/g, ']');

    // Remove angle brackets
    sanitized = sanitized.replace(/</g, '').replace(/>/g, '');

    // Fix backslashes
    sanitized = sanitized.replace(/\\/g, '/');

    // Escape quotes
    sanitized = sanitized.replace(/"/g, '\\"');

    return sanitized;
  }

  /**
   * Generate a safe node ID from a label
   * @param {string} label - The label text
   * @returns {string} - Safe node ID
   */
  static generateNodeId(label) {
    // Remove all non-alphanumeric characters and replace with underscores
    let id = label.replace(/[^a-zA-Z0-9]/g, '_');

    // Ensure it starts with a letter
    if (!/^[a-zA-Z]/.test(id)) {
      id = 'node_' + id;
    }

    // Truncate if too long
    if (id.length > 20) {
      id = id.substring(0, 20);
    }

    return id;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MermaidValidator;
}