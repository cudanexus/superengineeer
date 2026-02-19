import {
  ADJECTIVES,
  NOUNS,
  generateRandomUsername
} from '../../../src/utils/word-lists';

describe('word-lists', () => {
  describe('ADJECTIVES', () => {
    it('should contain at least 40 words', () => {
      expect(ADJECTIVES.length).toBeGreaterThanOrEqual(40);
    });

    it('should contain only lowercase words', () => {
      ADJECTIVES.forEach((word) => {
        expect(word).toBe(word.toLowerCase());
      });
    });

    it('should not contain duplicates', () => {
      const unique = new Set(ADJECTIVES);
      expect(unique.size).toBe(ADJECTIVES.length);
    });
  });

  describe('NOUNS', () => {
    it('should contain at least 40 words', () => {
      expect(NOUNS.length).toBeGreaterThanOrEqual(40);
    });

    it('should contain only lowercase words', () => {
      NOUNS.forEach((word) => {
        expect(word).toBe(word.toLowerCase());
      });
    });

    it('should not contain duplicates', () => {
      const unique = new Set(NOUNS);
      expect(unique.size).toBe(NOUNS.length);
    });
  });

  describe('generateRandomUsername', () => {
    it('should return a string', () => {
      const username = generateRandomUsername();
      expect(typeof username).toBe('string');
    });

    it('should return format adjective-noun', () => {
      const username = generateRandomUsername();
      expect(username).toMatch(/^[a-z]+-[a-z]+$/);
    });

    it('should use words from ADJECTIVES and NOUNS', () => {
      const username = generateRandomUsername();
      const [adjective, noun] = username.split('-');

      expect(ADJECTIVES).toContain(adjective);
      expect(NOUNS).toContain(noun);
    });

    it('should generate different usernames (high probability)', () => {
      const usernames = new Set<string>();

      // Generate 100 usernames
      for (let i = 0; i < 100; i++) {
        usernames.add(generateRandomUsername());
      }

      // Should have at least 90 unique values (allowing for some collisions)
      expect(usernames.size).toBeGreaterThan(90);
    });

    it('should not contain spaces', () => {
      for (let i = 0; i < 20; i++) {
        const username = generateRandomUsername();
        expect(username).not.toContain(' ');
      }
    });
  });
});
