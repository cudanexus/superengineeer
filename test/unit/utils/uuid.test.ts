import { generateUUID, isValidUUID } from '../../../src/utils/uuid';

describe('UUID utilities', () => {
  describe('generateUUID', () => {
    it('should generate a valid UUID v4', () => {
      const uuid = generateUUID();

      expect(isValidUUID(uuid)).toBe(true);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        uuids.add(generateUUID());
      }

      expect(uuids.size).toBe(1000);
    });

    it('should generate UUID in correct format', () => {
      const uuid = generateUUID();

      // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should have version 4 marker', () => {
      const uuid = generateUUID();
      const parts = uuid.split('-');

      // Third part should start with 4
      expect(parts[2]?.charAt(0)).toBe('4');
    });

    it('should have correct variant bits', () => {
      const uuid = generateUUID();
      const parts = uuid.split('-');

      // Fourth part should start with 8, 9, a, or b
      const variantChar = parts[3]?.charAt(0).toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });
  });

  describe('isValidUUID', () => {
    describe('valid UUIDs', () => {
      it('should validate generated UUIDs', () => {
        const uuid = generateUUID();

        expect(isValidUUID(uuid)).toBe(true);
      });

      it('should validate lowercase UUID', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      });

      it('should validate uppercase UUID', () => {
        expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      });

      it('should validate mixed case UUID', () => {
        expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
      });

      it('should validate various valid v4 UUIDs', () => {
        const validUUIDs = [
          'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          '123e4567-e89b-42d3-a456-426614174000',
        ];

        validUUIDs.forEach((uuid) => {
          expect(isValidUUID(uuid)).toBe(true);
        });
      });
    });

    describe('invalid UUIDs', () => {
      it('should reject empty string', () => {
        expect(isValidUUID('')).toBe(false);
      });

      it('should reject non-UUID strings', () => {
        expect(isValidUUID('not-a-uuid')).toBe(false);
        expect(isValidUUID('hello-world')).toBe(false);
        expect(isValidUUID('12345')).toBe(false);
      });

      it('should reject UUID with wrong version', () => {
        // Version 1 UUID (has 1 instead of 4 in position)
        expect(isValidUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(false);

        // Version 3 UUID
        expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false);

        // Version 5 UUID
        expect(isValidUUID('550e8400-e29b-51d4-a716-446655440000')).toBe(false);
      });

      it('should reject UUID with wrong variant', () => {
        // Variant should be 8, 9, a, or b in fourth group
        expect(isValidUUID('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-7716-446655440000')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
      });

      it('should reject UUID without hyphens', () => {
        expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
      });

      it('should reject UUID with extra hyphens', () => {
        expect(isValidUUID('550e-8400-e29b-41d4-a716-446655440000')).toBe(false);
      });

      it('should reject UUID with wrong length segments', () => {
        expect(isValidUUID('550e840-e29b-41d4-a716-446655440000')).toBe(false);
        expect(isValidUUID('550e8400-e29-41d4-a716-446655440000')).toBe(false);
      });

      it('should reject UUID with invalid characters', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000!')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-a716-4466554400 0')).toBe(false);
      });

      it('should reject UUID with braces', () => {
        expect(isValidUUID('{550e8400-e29b-41d4-a716-446655440000}')).toBe(false);
      });

      it('should reject null-like values', () => {
        expect(isValidUUID('null')).toBe(false);
        expect(isValidUUID('undefined')).toBe(false);
      });
    });
  });
});
