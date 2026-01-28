/**
 * Tests for DiffEngine module
 */

const DiffEngine = require('../../public/js/modules/diff-engine.js');

describe('DiffEngine', () => {
  describe('Constants', () => {
    it('should have DIFF_PREVIEW_LINES constant', () => {
      expect(DiffEngine.DIFF_PREVIEW_LINES).toBe(15);
    });

    it('should have CONTEXT_LINES constant', () => {
      expect(DiffEngine.CONTEXT_LINES).toBe(2);
    });
  });

  describe('extensionToLanguage', () => {
    it('should map js to javascript', () => {
      expect(DiffEngine.extensionToLanguage['js']).toBe('javascript');
    });

    it('should map ts to typescript', () => {
      expect(DiffEngine.extensionToLanguage['ts']).toBe('typescript');
    });

    it('should map py to python', () => {
      expect(DiffEngine.extensionToLanguage['py']).toBe('python');
    });

    it('should map dockerfile to dockerfile', () => {
      expect(DiffEngine.extensionToLanguage['dockerfile']).toBe('dockerfile');
    });

    it('should have all common extensions', () => {
      const extensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'java', 'go', 'rs', 'php', 'css', 'html', 'json', 'yaml', 'md'];
      extensions.forEach(ext => {
        expect(DiffEngine.extensionToLanguage[ext]).toBeDefined();
      });
    });
  });

  describe('getLanguageFromPath', () => {
    it('should return null for null path', () => {
      expect(DiffEngine.getLanguageFromPath(null)).toBe(null);
    });

    it('should return null for empty path', () => {
      expect(DiffEngine.getLanguageFromPath('')).toBe(null);
    });

    it('should detect javascript from .js extension', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/file.js')).toBe('javascript');
    });

    it('should detect typescript from .ts extension', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/file.ts')).toBe('typescript');
    });

    it('should detect python from .py extension', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/script.py')).toBe('python');
    });

    it('should detect dockerfile from filename', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/Dockerfile')).toBe('dockerfile');
    });

    it('should detect makefile from filename', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/Makefile')).toBe('makefile');
    });

    it('should handle dotfiles', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/.bashrc')).toBe(null);
    });

    it('should return null for unknown extension', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/file.unknown')).toBe(null);
    });

    it('should handle Windows paths', () => {
      expect(DiffEngine.getLanguageFromPath('C:\\Users\\test\\file.ts')).toBe('typescript');
    });

    it('should be case insensitive for filename', () => {
      expect(DiffEngine.getLanguageFromPath('/path/to/DOCKERFILE')).toBe('dockerfile');
    });
  });

  describe('computeLCS', () => {
    it('should return empty array for empty inputs', () => {
      expect(DiffEngine.computeLCS([], [])).toEqual([]);
    });

    it('should return empty array when no common elements', () => {
      expect(DiffEngine.computeLCS(['a', 'b'], ['c', 'd'])).toEqual([]);
    });

    it('should return identical array when inputs are the same', () => {
      const arr = ['a', 'b', 'c'];
      expect(DiffEngine.computeLCS(arr, arr)).toEqual(arr);
    });

    it('should find LCS of two arrays', () => {
      const arr1 = ['a', 'b', 'c', 'd'];
      const arr2 = ['a', 'c', 'd'];
      expect(DiffEngine.computeLCS(arr1, arr2)).toEqual(['a', 'c', 'd']);
    });

    it('should handle single element arrays', () => {
      expect(DiffEngine.computeLCS(['a'], ['a'])).toEqual(['a']);
      expect(DiffEngine.computeLCS(['a'], ['b'])).toEqual([]);
    });

    it('should find LCS with interleaved elements', () => {
      const arr1 = ['a', 'b', 'c'];
      const arr2 = ['a', 'x', 'b', 'y', 'c'];
      expect(DiffEngine.computeLCS(arr1, arr2)).toEqual(['a', 'b', 'c']);
    });

    it('should handle one empty array', () => {
      expect(DiffEngine.computeLCS(['a', 'b'], [])).toEqual([]);
      expect(DiffEngine.computeLCS([], ['a', 'b'])).toEqual([]);
    });

    it('should find correct LCS for classic example', () => {
      const arr1 = ['A', 'B', 'C', 'B', 'D', 'A', 'B'];
      const arr2 = ['B', 'D', 'C', 'A', 'B', 'A'];
      const lcs = DiffEngine.computeLCS(arr1, arr2);
      // One valid LCS is ['B', 'C', 'B', 'A'] or ['B', 'D', 'A', 'B']
      expect(lcs.length).toBe(4);
    });
  });

  describe('isSimilar', () => {
    it('should return false for null strings', () => {
      expect(DiffEngine.isSimilar(null, 'test')).toBe(false);
      expect(DiffEngine.isSimilar('test', null)).toBe(false);
      expect(DiffEngine.isSimilar(null, null)).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(DiffEngine.isSimilar('', 'test')).toBe(false);
      expect(DiffEngine.isSimilar('test', '')).toBe(false);
    });

    it('should return true for identical strings', () => {
      expect(DiffEngine.isSimilar('hello', 'hello')).toBe(true);
    });

    it('should return true for similar strings', () => {
      expect(DiffEngine.isSimilar('hello world', 'hello there')).toBe(true);
    });

    it('should return false for very different strings', () => {
      expect(DiffEngine.isSimilar('abc', 'xyz')).toBe(false);
    });

    it('should return false for strings with very different lengths', () => {
      expect(DiffEngine.isSimilar('a', 'abcdefghij')).toBe(false);
    });

    it('should handle strings with minor modifications', () => {
      expect(DiffEngine.isSimilar('const x = 1;', 'const x = 2;')).toBe(true);
    });
  });

  describe('computeDiff', () => {
    it('should handle empty strings (single empty line)', () => {
      // Empty string split by \n gives [''], so we get one unchanged empty line
      const result = DiffEngine.computeDiff('', '');
      expect(result).toEqual([{ type: 'unchanged', content: '' }]);
    });

    it('should return unchanged for identical strings', () => {
      const result = DiffEngine.computeDiff('line1\nline2', 'line1\nline2');
      expect(result).toEqual([
        { type: 'unchanged', content: 'line1' },
        { type: 'unchanged', content: 'line2' }
      ]);
    });

    it('should detect added lines', () => {
      const result = DiffEngine.computeDiff('line1', 'line1\nline2');
      expect(result).toContainEqual({ type: 'add', content: 'line2' });
    });

    it('should detect removed lines', () => {
      const result = DiffEngine.computeDiff('line1\nline2', 'line1');
      expect(result).toContainEqual({ type: 'remove', content: 'line2' });
    });

    it('should detect modified lines', () => {
      const result = DiffEngine.computeDiff('const x = 1;', 'const x = 2;');
      // Should detect as change since lines are similar
      expect(result.some(r => r.type === 'change')).toBe(true);
    });

    it('should handle multiple changes', () => {
      const old = 'a\nb\nc';
      const newStr = 'a\nx\nc';
      const result = DiffEngine.computeDiff(old, newStr);
      expect(result.filter(r => r.type === 'unchanged').length).toBe(2); // a and c
    });

    it('should handle completely different content', () => {
      const result = DiffEngine.computeDiff('abc', 'xyz');
      expect(result.some(r => r.type === 'remove' || r.type === 'change')).toBe(true);
      expect(result.some(r => r.type === 'add' || r.type === 'change')).toBe(true);
    });
  });

  describe('computeWordDiff', () => {
    it('should return empty chunks for empty strings', () => {
      const result = DiffEngine.computeWordDiff('', '');
      expect(result.leftChunks).toEqual([]);
      expect(result.rightChunks).toEqual([]);
    });

    it('should detect added words', () => {
      const result = DiffEngine.computeWordDiff('hello', 'hello world');
      expect(result.rightChunks.some(c => c.type === 'added' && c.text.includes('world'))).toBe(true);
    });

    it('should detect removed words', () => {
      const result = DiffEngine.computeWordDiff('hello world', 'hello');
      expect(result.leftChunks.some(c => c.type === 'removed' && c.text.includes('world'))).toBe(true);
    });

    it('should detect unchanged words', () => {
      const result = DiffEngine.computeWordDiff('hello world', 'hello there');
      expect(result.leftChunks.some(c => c.type === 'unchanged' && c.text === 'hello')).toBe(true);
      expect(result.rightChunks.some(c => c.type === 'unchanged' && c.text === 'hello')).toBe(true);
    });

    it('should preserve whitespace', () => {
      const result = DiffEngine.computeWordDiff('a  b', 'a  c');
      // Whitespace should be preserved in the chunks
      const allText = result.leftChunks.map(c => c.text).join('');
      expect(allText).toBe('a  b');
    });

    it('should handle single word change', () => {
      const result = DiffEngine.computeWordDiff('foo', 'bar');
      expect(result.leftChunks).toEqual([{ text: 'foo', type: 'removed' }]);
      expect(result.rightChunks).toEqual([{ text: 'bar', type: 'added' }]);
    });
  });

  describe('computeAlignedDiff', () => {
    it('should handle empty strings (single unchanged empty line)', () => {
      // Empty string split by \n gives [''], so we get one unchanged empty line
      const result = DiffEngine.computeAlignedDiff('', '');
      expect(result).toEqual([
        { left: '', right: '', type: 'unchanged' }
      ]);
    });

    it('should align identical lines', () => {
      const result = DiffEngine.computeAlignedDiff('line1', 'line1');
      expect(result).toEqual([
        { left: 'line1', right: 'line1', type: 'unchanged' }
      ]);
    });

    it('should align added lines', () => {
      // Empty vs content creates a change (empty line paired with new content)
      const result = DiffEngine.computeAlignedDiff('', 'new line');
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('change');
      expect(result[0].right).toBe('new line');
    });

    it('should align removed lines', () => {
      // Content vs empty creates a change (old content paired with empty line)
      const result = DiffEngine.computeAlignedDiff('old line', '');
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('change');
      expect(result[0].left).toBe('old line');
    });

    it('should pair remove+add as change with word diff', () => {
      const result = DiffEngine.computeAlignedDiff('const x = 1', 'const x = 2');
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('change');
      expect(result[0].leftChunks).toBeDefined();
      expect(result[0].rightChunks).toBeDefined();
    });

    it('should handle multiple aligned lines', () => {
      const old = 'line1\nold\nline3';
      const newStr = 'line1\nnew\nline3';
      const result = DiffEngine.computeAlignedDiff(old, newStr);

      expect(result.length).toBe(3);
      expect(result[0].type).toBe('unchanged');
      expect(result[1].type).toBe('change');
      expect(result[2].type).toBe('unchanged');
    });
  });

  describe('parseUnifiedDiff', () => {
    it('should return empty array for null input', () => {
      expect(DiffEngine.parseUnifiedDiff(null)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(DiffEngine.parseUnifiedDiff('')).toEqual([]);
    });

    it('should return empty array for whitespace only', () => {
      expect(DiffEngine.parseUnifiedDiff('   \n   ')).toEqual([]);
    });

    it('should parse simple addition', () => {
      const diff = '+added line';
      const result = DiffEngine.parseUnifiedDiff(diff);
      expect(result).toEqual([
        { left: '', right: 'added line', type: 'add' }
      ]);
    });

    it('should parse simple removal', () => {
      const diff = '-removed line';
      const result = DiffEngine.parseUnifiedDiff(diff);
      expect(result).toEqual([
        { left: 'removed line', right: '', type: 'remove' }
      ]);
    });

    it('should parse context line', () => {
      const diff = ' unchanged line';
      const result = DiffEngine.parseUnifiedDiff(diff);
      expect(result).toEqual([
        { left: 'unchanged line', right: 'unchanged line', type: 'unchanged' }
      ]);
    });

    it('should pair remove+add as change', () => {
      const diff = '-old content\n+new content';
      const result = DiffEngine.parseUnifiedDiff(diff);
      expect(result).toEqual([
        { left: 'old content', right: 'new content', type: 'change' }
      ]);
    });

    it('should skip diff headers', () => {
      const diff = 'diff --git a/file.js b/file.js\nindex 123..456 789\n--- a/file.js\n+++ b/file.js\n@@ -1,3 +1,3 @@\n context\n-old\n+new';
      const result = DiffEngine.parseUnifiedDiff(diff);
      expect(result.some(r => r.left.includes('diff --git'))).toBe(false);
      expect(result.some(r => r.left.includes('index'))).toBe(false);
      expect(result.some(r => r.left.includes('---'))).toBe(false);
    });

    it('should handle multiple consecutive removes', () => {
      const diff = '-line1\n-line2\n context';
      const result = DiffEngine.parseUnifiedDiff(diff);
      const removes = result.filter(r => r.type === 'remove');
      expect(removes.length).toBe(2);
    });

    it('should handle multiple consecutive adds', () => {
      const diff = '+line1\n+line2\n context';
      const result = DiffEngine.parseUnifiedDiff(diff);
      const adds = result.filter(r => r.type === 'add');
      expect(adds.length).toBe(2);
    });

    it('should handle complex diff', () => {
      const diff = `diff --git a/test.js b/test.js
--- a/test.js
+++ b/test.js
@@ -1,5 +1,5 @@
 function test() {
-  const x = 1;
+  const x = 2;
   return x;
 }`;
      const result = DiffEngine.parseUnifiedDiff(diff);

      expect(result.length).toBe(4);
      expect(result[0].type).toBe('unchanged');
      expect(result[1].type).toBe('change');
      expect(result[2].type).toBe('unchanged');
      expect(result[3].type).toBe('unchanged');
    });

    it('should skip no newline indicator', () => {
      const diff = '-old\n\\ No newline at end of file\n+new';
      const result = DiffEngine.parseUnifiedDiff(diff);
      expect(result.some(r => r.left.includes('No newline'))).toBe(false);
    });
  });

  describe('selectDiffPreviewLines', () => {
    function makeAligned(types) {
      return types.map((t, i) => ({
        left: 'line' + i,
        right: 'line' + i,
        type: t
      }));
    }

    it('should return empty array for empty diff', () => {
      expect(DiffEngine.selectDiffPreviewLines([], 10)).toEqual([]);
    });

    it('should return all lines if under max', () => {
      const aligned = makeAligned(['unchanged', 'unchanged']);
      const result = DiffEngine.selectDiffPreviewLines(aligned, 10);
      expect(result[0].lines.length).toBe(2);
    });

    it('should prioritize changed lines', () => {
      const aligned = makeAligned(['unchanged', 'unchanged', 'change', 'unchanged', 'unchanged']);
      const result = DiffEngine.selectDiffPreviewLines(aligned, 5);

      // Should include the change and context around it
      const flatLines = result.flatMap(g => g.lines);
      expect(flatLines.some(l => l.row.type === 'change')).toBe(true);
    });

    it('should add context around changes', () => {
      const aligned = makeAligned(['unchanged', 'unchanged', 'change', 'unchanged', 'unchanged']);
      const result = DiffEngine.selectDiffPreviewLines(aligned, 10);

      // Should include context before and after
      const flatLines = result.flatMap(g => g.lines);
      expect(flatLines.length).toBeGreaterThan(1);
    });

    it('should respect maxLines limit', () => {
      const aligned = makeAligned(new Array(100).fill('change'));
      const result = DiffEngine.selectDiffPreviewLines(aligned, 10);

      const totalLines = result.reduce((sum, g) => sum + g.lines.length, 0);
      expect(totalLines).toBeLessThanOrEqual(10);
    });

    it('should group nearby changes', () => {
      const aligned = makeAligned(['change', 'unchanged', 'change']);
      const result = DiffEngine.selectDiffPreviewLines(aligned, 10);

      // Should be in same group since they're close together
      expect(result.length).toBe(1);
    });

    it('should separate distant changes into groups', () => {
      const types = [
        'change',
        ...new Array(10).fill('unchanged'),
        'change'
      ];
      const aligned = makeAligned(types);
      const result = DiffEngine.selectDiffPreviewLines(aligned, 20);

      // Should have two groups
      expect(result.length).toBe(2);
    });

    it('should show first lines if no changes', () => {
      const aligned = makeAligned(['unchanged', 'unchanged', 'unchanged']);
      const result = DiffEngine.selectDiffPreviewLines(aligned, 2);

      expect(result.length).toBe(1);
      expect(result[0].lines.length).toBe(2);
    });
  });
});
