/**
 * Tests for validation utility functions
 */

const Utils = require('../../public/js/utils.js');

describe('Validation Utilities', () => {
  describe('validateFileName', () => {
    describe('valid file names', () => {
      it('should accept simple file name', () => {
        const result = Utils.validateFileName('file.txt');

        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      });

      it('should accept file name with numbers', () => {
        expect(Utils.validateFileName('file123.txt').valid).toBe(true);
      });

      it('should accept file name with dashes', () => {
        expect(Utils.validateFileName('my-file.txt').valid).toBe(true);
      });

      it('should accept file name with underscores', () => {
        expect(Utils.validateFileName('my_file.txt').valid).toBe(true);
      });

      it('should accept file name without extension', () => {
        expect(Utils.validateFileName('README').valid).toBe(true);
      });

      it('should accept file name with multiple dots', () => {
        expect(Utils.validateFileName('file.test.txt').valid).toBe(true);
      });

      it('should accept file name with spaces', () => {
        expect(Utils.validateFileName('my file.txt').valid).toBe(true);
      });

      it('should accept file name with parentheses', () => {
        expect(Utils.validateFileName('file (1).txt').valid).toBe(true);
      });

      it('should accept file name with unicode characters', () => {
        expect(Utils.validateFileName('файл.txt').valid).toBe(true);
      });
    });

    describe('empty/whitespace names', () => {
      it('should reject empty string', () => {
        const result = Utils.validateFileName('');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });

      it('should reject null', () => {
        const result = Utils.validateFileName(null);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });

      it('should reject undefined', () => {
        const result = Utils.validateFileName(undefined);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });

      it('should reject whitespace only', () => {
        const result = Utils.validateFileName('   ');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });
    });

    describe('invalid characters', () => {
      it('should reject less than sign', () => {
        const result = Utils.validateFileName('file<name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject greater than sign', () => {
        const result = Utils.validateFileName('file>name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject colon', () => {
        const result = Utils.validateFileName('file:name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject double quote', () => {
        const result = Utils.validateFileName('file"name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject forward slash', () => {
        const result = Utils.validateFileName('file/name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject backslash', () => {
        const result = Utils.validateFileName('file\\name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject pipe', () => {
        const result = Utils.validateFileName('file|name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject question mark', () => {
        const result = Utils.validateFileName('file?name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject asterisk', () => {
        const result = Utils.validateFileName('file*name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject control characters', () => {
        const result = Utils.validateFileName('file\x00name.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });
    });

    describe('reserved names', () => {
      it('should reject CON', () => {
        const result = Utils.validateFileName('CON');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject con (lowercase)', () => {
        const result = Utils.validateFileName('con');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject PRN', () => {
        expect(Utils.validateFileName('PRN').valid).toBe(false);
      });

      it('should reject AUX', () => {
        expect(Utils.validateFileName('AUX').valid).toBe(false);
      });

      it('should reject NUL', () => {
        expect(Utils.validateFileName('NUL').valid).toBe(false);
      });

      it('should reject COM1 through COM9', () => {
        for (let i = 0; i <= 9; i++) {
          expect(Utils.validateFileName(`COM${i}`).valid).toBe(false);
        }
      });

      it('should reject LPT1 through LPT9', () => {
        for (let i = 0; i <= 9; i++) {
          expect(Utils.validateFileName(`LPT${i}`).valid).toBe(false);
        }
      });

      it('should reject reserved name with extension', () => {
        const result = Utils.validateFileName('CON.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should allow reserved name as part of longer name', () => {
        expect(Utils.validateFileName('CONSOLE.txt').valid).toBe(true);
        expect(Utils.validateFileName('PRINTER.txt').valid).toBe(true);
      });
    });

    describe('dot handling', () => {
      it('should reject single dot', () => {
        const result = Utils.validateFileName('.');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be just a dot');
      });

      it('should reject trailing dot', () => {
        const result = Utils.validateFileName('file.');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot end with a space or dot');
      });

      it('should allow hidden files (starting with dot)', () => {
        expect(Utils.validateFileName('.gitignore').valid).toBe(true);
      });

      it('should allow double dot in name', () => {
        expect(Utils.validateFileName('file..txt').valid).toBe(true);
      });
    });

    describe('trailing space handling', () => {
      it('should reject trailing space', () => {
        const result = Utils.validateFileName('file.txt ');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot end with a space or dot');
      });

      it('should trim leading spaces and validate', () => {
        // The function trims, so leading spaces are OK
        expect(Utils.validateFileName(' file.txt').valid).toBe(true);
      });
    });
  });

  describe('validateFolderName', () => {
    describe('valid folder names', () => {
      it('should accept simple folder name', () => {
        const result = Utils.validateFolderName('folder');

        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
      });

      it('should accept folder name with numbers', () => {
        expect(Utils.validateFolderName('folder123').valid).toBe(true);
      });

      it('should accept folder name with dashes', () => {
        expect(Utils.validateFolderName('my-folder').valid).toBe(true);
      });

      it('should accept folder name with underscores', () => {
        expect(Utils.validateFolderName('my_folder').valid).toBe(true);
      });

      it('should accept folder name with dots', () => {
        expect(Utils.validateFolderName('folder.name').valid).toBe(true);
      });

      it('should accept folder name with spaces', () => {
        expect(Utils.validateFolderName('my folder').valid).toBe(true);
      });
    });

    describe('empty/whitespace names', () => {
      it('should reject empty string', () => {
        const result = Utils.validateFolderName('');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be empty');
      });

      it('should reject null', () => {
        const result = Utils.validateFolderName(null);

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be empty');
      });

      it('should reject whitespace only', () => {
        const result = Utils.validateFolderName('   ');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be empty');
      });
    });

    describe('invalid characters', () => {
      it('should reject forward slash', () => {
        const result = Utils.validateFolderName('folder/name');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name contains invalid characters');
      });

      it('should reject backslash', () => {
        const result = Utils.validateFolderName('folder\\name');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name contains invalid characters');
      });

      it('should reject colon', () => {
        const result = Utils.validateFolderName('folder:name');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name contains invalid characters');
      });

      it('should reject all Windows-invalid characters', () => {
        const invalidChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

        invalidChars.forEach(char => {
          expect(Utils.validateFolderName(`folder${char}name`).valid).toBe(false);
        });
      });
    });

    describe('reserved names', () => {
      it('should reject CON', () => {
        expect(Utils.validateFolderName('CON').valid).toBe(false);
      });

      it('should reject NUL', () => {
        expect(Utils.validateFolderName('NUL').valid).toBe(false);
      });

      it('should reject COM1', () => {
        expect(Utils.validateFolderName('COM1').valid).toBe(false);
      });
    });

    describe('dot handling', () => {
      it('should reject single dot', () => {
        const result = Utils.validateFolderName('.');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be just dots');
      });

      it('should reject double dot', () => {
        const result = Utils.validateFolderName('..');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be just dots');
      });

      it('should allow hidden folders (starting with dot)', () => {
        expect(Utils.validateFolderName('.git').valid).toBe(true);
      });

      it('should allow folder name ending with dot', () => {
        // Folders CAN end with dots (unlike files)
        expect(Utils.validateFolderName('folder.').valid).toBe(true);
      });
    });

    describe('trailing space handling', () => {
      it('should reject trailing space', () => {
        const result = Utils.validateFolderName('folder ');

        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot end with a space');
      });
    });
  });
});
