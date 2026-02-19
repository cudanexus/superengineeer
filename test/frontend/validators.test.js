/**
 * @jest-environment jsdom
 */

const Validators = require('../../public/js/modules/validators');

describe('Validators', () => {
  describe('validateFileName', () => {
    describe('empty names', () => {
      it('should reject empty string', () => {
        const result = Validators.validateFileName('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });

      it('should reject whitespace-only string', () => {
        const result = Validators.validateFileName('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });

      it('should reject null', () => {
        const result = Validators.validateFileName(null);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });

      it('should reject undefined', () => {
        const result = Validators.validateFileName(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be empty');
      });
    });

    describe('invalid characters', () => {
      it('should reject names with <', () => {
        const result = Validators.validateFileName('file<name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with >', () => {
        const result = Validators.validateFileName('file>name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with :', () => {
        const result = Validators.validateFileName('file:name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with "', () => {
        const result = Validators.validateFileName('file"name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with /', () => {
        const result = Validators.validateFileName('file/name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with \\', () => {
        const result = Validators.validateFileName('file\\name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with |', () => {
        const result = Validators.validateFileName('file|name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with ?', () => {
        const result = Validators.validateFileName('file?name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with *', () => {
        const result = Validators.validateFileName('file*name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });

      it('should reject names with control characters', () => {
        const result = Validators.validateFileName('file\x00name.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name contains invalid characters');
      });
    });

    describe('reserved names', () => {
      it('should reject CON', () => {
        const result = Validators.validateFileName('CON');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject con (lowercase)', () => {
        const result = Validators.validateFileName('con');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject PRN', () => {
        const result = Validators.validateFileName('PRN');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject AUX', () => {
        const result = Validators.validateFileName('AUX');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject NUL', () => {
        const result = Validators.validateFileName('NUL');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject COM1', () => {
        const result = Validators.validateFileName('COM1');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject LPT1', () => {
        const result = Validators.validateFileName('LPT1');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });

      it('should reject CON.txt (reserved with extension)', () => {
        const result = Validators.validateFileName('CON.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name is reserved by the system');
      });
    });

    describe('dot restrictions', () => {
      it('should reject single dot', () => {
        const result = Validators.validateFileName('.');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot be just a dot');
      });

      it('should reject trailing dot', () => {
        const result = Validators.validateFileName('file.');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('File name cannot end with a dot');
      });

      it('should accept name with trailing space (gets trimmed)', () => {
        // Trailing spaces are trimmed, so this is valid
        const result = Validators.validateFileName('file ');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });
    });

    describe('valid names', () => {
      it('should accept simple filename', () => {
        const result = Validators.validateFileName('file.txt');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept filename with dots', () => {
        const result = Validators.validateFileName('file.name.txt');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept filename with dashes and underscores', () => {
        const result = Validators.validateFileName('my-file_name.txt');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept filename with spaces in middle', () => {
        const result = Validators.validateFileName('my file name.txt');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept filename starting with dot', () => {
        const result = Validators.validateFileName('.gitignore');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept double dots in middle', () => {
        const result = Validators.validateFileName('file..name.txt');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept CONtest (reserved prefix but not reserved)', () => {
        const result = Validators.validateFileName('CONtest.txt');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });
    });
  });

  describe('validateFolderName', () => {
    describe('empty names', () => {
      it('should reject empty string', () => {
        const result = Validators.validateFolderName('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be empty');
      });

      it('should reject whitespace-only string', () => {
        const result = Validators.validateFolderName('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be empty');
      });

      it('should reject null', () => {
        const result = Validators.validateFolderName(null);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be empty');
      });

      it('should reject undefined', () => {
        const result = Validators.validateFolderName(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be empty');
      });
    });

    describe('invalid characters', () => {
      it('should reject names with <', () => {
        const result = Validators.validateFolderName('folder<name');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name contains invalid characters');
      });

      it('should reject names with >', () => {
        const result = Validators.validateFolderName('folder>name');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name contains invalid characters');
      });

      it('should reject names with /', () => {
        const result = Validators.validateFolderName('folder/name');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name contains invalid characters');
      });
    });

    describe('reserved names', () => {
      it('should reject CON', () => {
        const result = Validators.validateFolderName('CON');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name is reserved by the system');
      });

      it('should reject NUL', () => {
        const result = Validators.validateFolderName('NUL');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name is reserved by the system');
      });
    });

    describe('dot restrictions', () => {
      it('should reject single dot', () => {
        const result = Validators.validateFolderName('.');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be just dots');
      });

      it('should reject double dot', () => {
        const result = Validators.validateFolderName('..');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Folder name cannot be just dots');
      });

      it('should accept name with trailing space (gets trimmed)', () => {
        // Trailing spaces are trimmed, so this is valid
        const result = Validators.validateFolderName('folder ');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should allow trailing dot for folders', () => {
        // Unlike files, folders can end with a dot
        const result = Validators.validateFolderName('folder.');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });
    });

    describe('valid names', () => {
      it('should accept simple folder name', () => {
        const result = Validators.validateFolderName('folder');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept folder name with dots', () => {
        const result = Validators.validateFolderName('folder.name');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept folder name with dashes and underscores', () => {
        const result = Validators.validateFolderName('my-folder_name');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept folder name with spaces in middle', () => {
        const result = Validators.validateFolderName('my folder name');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });

      it('should accept folder name starting with dot', () => {
        const result = Validators.validateFolderName('.git');
        expect(result.valid).toBe(true);
        expect(result.error).toBe(null);
      });
    });
  });
});
