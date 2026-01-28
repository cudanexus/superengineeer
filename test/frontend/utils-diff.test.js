/**
 * Tests for diff parsing utility functions
 */

const Utils = require('../../public/js/utils.js');

describe('Diff Parsing Utilities', () => {
  describe('parseUnifiedDiff', () => {
    describe('empty/invalid input', () => {
      it('should return empty array for null', () => {
        expect(Utils.parseUnifiedDiff(null)).toEqual([]);
      });

      it('should return empty array for undefined', () => {
        expect(Utils.parseUnifiedDiff(undefined)).toEqual([]);
      });

      it('should return empty array for empty string', () => {
        expect(Utils.parseUnifiedDiff('')).toEqual([]);
      });

      it('should return empty array for whitespace only', () => {
        expect(Utils.parseUnifiedDiff('   \n  \n  ')).toEqual([]);
      });

      it('should return empty array for diff headers only', () => {
        const diff = `diff --git a/file.txt b/file.txt
index abc123..def456 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@`;

        expect(Utils.parseUnifiedDiff(diff)).toEqual([]);
      });
    });

    describe('additions', () => {
      it('should parse single added line', () => {
        const diff = '+new line';

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ left: '', right: 'new line', type: 'add' });
      });

      it('should parse multiple added lines', () => {
        const diff = `+line one
+line two
+line three`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(3);
        expect(result[0].type).toBe('add');
        expect(result[0].right).toBe('line one');
        expect(result[1].right).toBe('line two');
        expect(result[2].right).toBe('line three');
      });
    });

    describe('removals', () => {
      it('should parse single removed line', () => {
        const diff = '-old line';

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ left: 'old line', right: '', type: 'remove' });
      });

      it('should parse multiple removed lines', () => {
        const diff = `-line one
-line two`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('remove');
        expect(result[1].type).toBe('remove');
      });
    });

    describe('changes (paired remove/add)', () => {
      it('should pair consecutive remove and add as change', () => {
        const diff = `-old content
+new content`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          left: 'old content',
          right: 'new content',
          type: 'change'
        });
      });

      it('should pair multiple consecutive remove/add pairs', () => {
        const diff = `-old line 1
-old line 2
+new line 1
+new line 2`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('change');
        expect(result[0].left).toBe('old line 1');
        expect(result[0].right).toBe('new line 1');
        expect(result[1].type).toBe('change');
        expect(result[1].left).toBe('old line 2');
        expect(result[1].right).toBe('new line 2');
      });

      it('should handle more removes than adds', () => {
        const diff = `-line 1
-line 2
-line 3
+new line`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(3);
        expect(result[0].type).toBe('change');
        expect(result[0].left).toBe('line 1');
        expect(result[0].right).toBe('new line');
        expect(result[1].type).toBe('remove');
        expect(result[1].left).toBe('line 2');
        expect(result[2].type).toBe('remove');
        expect(result[2].left).toBe('line 3');
      });

      it('should handle more adds than removes', () => {
        const diff = `-old line
+new line 1
+new line 2
+new line 3`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(3);
        expect(result[0].type).toBe('change');
        expect(result[0].left).toBe('old line');
        expect(result[0].right).toBe('new line 1');
        expect(result[1].type).toBe('add');
        expect(result[1].right).toBe('new line 2');
        expect(result[2].type).toBe('add');
        expect(result[2].right).toBe('new line 3');
      });
    });

    describe('context lines (unchanged)', () => {
      it('should parse context line', () => {
        const diff = ' unchanged line';

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          left: 'unchanged line',
          right: 'unchanged line',
          type: 'unchanged'
        });
      });

      it('should flush pending removes before context', () => {
        const diff = `-removed line
 context line`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('remove');
        expect(result[1].type).toBe('unchanged');
      });
    });

    describe('complex diffs', () => {
      it('should parse complete diff with headers', () => {
        const diff = `diff --git a/file.txt b/file.txt
index abc123..def456 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
 line 1
-old line 2
+new line 2
 line 3
 line 4
 line 5`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(5);
        expect(result[0]).toEqual({ left: 'line 1', right: 'line 1', type: 'unchanged' });
        expect(result[1]).toEqual({ left: 'old line 2', right: 'new line 2', type: 'change' });
        expect(result[2]).toEqual({ left: 'line 3', right: 'line 3', type: 'unchanged' });
        expect(result[3]).toEqual({ left: 'line 4', right: 'line 4', type: 'unchanged' });
        expect(result[4]).toEqual({ left: 'line 5', right: 'line 5', type: 'unchanged' });
      });

      it('should handle multiple hunks', () => {
        const diff = `@@ -1,3 +1,3 @@
 context
-removed
+added
@@ -10,3 +10,3 @@
 more context
-another remove
+another add`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(4);
        expect(result[0].type).toBe('unchanged');
        expect(result[1].type).toBe('change');
        expect(result[2].type).toBe('unchanged');
        expect(result[3].type).toBe('change');
      });

      it('should skip "No newline at end of file" marker', () => {
        const diff = `+new line
\\ No newline at end of file`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('add');
      });
    });

    describe('edge cases', () => {
      it('should handle lines with only spaces', () => {
        const diff = '+   ';

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(1);
        expect(result[0].right).toBe('   ');
      });

      it('should handle empty lines in diff', () => {
        const diff = `+line 1

+line 2`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(2);
      });

      it('should handle lines starting with diff markers in content', () => {
        // A line that was "+ something" in the original
        const diff = ' + something';

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(1);
        expect(result[0].left).toBe('+ something');
        expect(result[0].type).toBe('unchanged');
      });

      it('should handle tabs in lines', () => {
        const diff = '+\tcontent with tab';

        const result = Utils.parseUnifiedDiff(diff);

        expect(result[0].right).toBe('\tcontent with tab');
      });

      it('should flush remaining pending removes at end', () => {
        const diff = `-remove 1
-remove 2`;

        const result = Utils.parseUnifiedDiff(diff);

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('remove');
        expect(result[1].type).toBe('remove');
      });
    });
  });

  describe('sortProjects', () => {
    it('should return empty array for null', () => {
      expect(Utils.sortProjects(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(Utils.sortProjects(undefined)).toEqual([]);
    });

    it('should return empty array for non-array', () => {
      expect(Utils.sortProjects('not an array')).toEqual([]);
    });

    it('should return empty array for empty array', () => {
      expect(Utils.sortProjects([])).toEqual([]);
    });

    it('should sort alphabetically by name', () => {
      const projects = [
        { name: 'Zebra', status: 'stopped' },
        { name: 'Apple', status: 'stopped' },
        { name: 'Mango', status: 'stopped' }
      ];

      const result = Utils.sortProjects(projects);

      expect(result[0].name).toBe('Apple');
      expect(result[1].name).toBe('Mango');
      expect(result[2].name).toBe('Zebra');
    });

    it('should be case-insensitive', () => {
      const projects = [
        { name: 'zebra', status: 'stopped' },
        { name: 'Apple', status: 'stopped' },
        { name: 'MANGO', status: 'stopped' }
      ];

      const result = Utils.sortProjects(projects);

      expect(result[0].name).toBe('Apple');
      expect(result[1].name).toBe('MANGO');
      expect(result[2].name).toBe('zebra');
    });

    it('should put running projects first', () => {
      const projects = [
        { name: 'Zebra', status: 'stopped' },
        { name: 'Apple', status: 'running' },
        { name: 'Mango', status: 'stopped' }
      ];

      const result = Utils.sortProjects(projects);

      expect(result[0].name).toBe('Apple');
      expect(result[0].status).toBe('running');
    });

    it('should put queued projects first', () => {
      const projects = [
        { name: 'Zebra', status: 'stopped' },
        { name: 'Apple', status: 'queued' },
        { name: 'Mango', status: 'stopped' }
      ];

      const result = Utils.sortProjects(projects);

      expect(result[0].name).toBe('Apple');
      expect(result[0].status).toBe('queued');
    });

    it('should sort running/queued projects alphabetically among themselves', () => {
      const projects = [
        { name: 'Zebra', status: 'running' },
        { name: 'Apple', status: 'queued' },
        { name: 'Mango', status: 'running' }
      ];

      const result = Utils.sortProjects(projects);

      expect(result[0].name).toBe('Apple');
      expect(result[1].name).toBe('Mango');
      expect(result[2].name).toBe('Zebra');
    });

    it('should sort stopped projects alphabetically after running/queued', () => {
      const projects = [
        { name: 'Zebra', status: 'stopped' },
        { name: 'Beta', status: 'running' },
        { name: 'Apple', status: 'stopped' },
        { name: 'Alpha', status: 'queued' }
      ];

      const result = Utils.sortProjects(projects);

      expect(result[0].name).toBe('Alpha');
      expect(result[1].name).toBe('Beta');
      expect(result[2].name).toBe('Apple');
      expect(result[3].name).toBe('Zebra');
    });

    it('should not mutate original array', () => {
      const projects = [
        { name: 'Zebra', status: 'stopped' },
        { name: 'Apple', status: 'stopped' }
      ];
      const original = [...projects];

      Utils.sortProjects(projects);

      expect(projects).toEqual(original);
    });

    it('should handle projects with missing name', () => {
      const projects = [
        { name: 'Beta', status: 'stopped' },
        { status: 'stopped' },
        { name: 'Alpha', status: 'stopped' }
      ];

      const result = Utils.sortProjects(projects);

      expect(result[0].name).toBe(undefined);
      expect(result[1].name).toBe('Alpha');
      expect(result[2].name).toBe('Beta');
    });
  });
});
