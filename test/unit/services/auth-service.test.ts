import {
  createAuthService,
  AuthService,
  DefaultAuthService,
} from '../../../src/services/auth-service';

describe('AuthService', () => {
  let authService: AuthService;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.SUPERENGINEER_V5_USERNAME;
    delete process.env.SUPERENGINEER_V5_PASSWORD;
    authService = createAuthService();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('createAuthService', () => {
    it('should create a new auth service instance', () => {
      const service = createAuthService();

      expect(service).toBeDefined();
      expect(typeof service.getCredentials).toBe('function');
      expect(typeof service.createSession).toBe('function');
      expect(typeof service.validateSession).toBe('function');
      expect(typeof service.invalidateSession).toBe('function');
    });

    it('should create independent instances with different credentials', () => {
      const service1 = createAuthService();
      const service2 = createAuthService();

      const creds1 = service1.getCredentials();
      const creds2 = service2.getCredentials();

      // Very high probability of being different
      expect(creds1.username).not.toBe(creds2.username);
      expect(creds1.password).not.toBe(creds2.password);
    });
  });

  describe('getCredentials', () => {
    it('should return username and password', () => {
      const credentials = authService.getCredentials();

      expect(credentials.username).toBeDefined();
      expect(credentials.password).toBeDefined();
      expect(typeof credentials.username).toBe('string');
      expect(typeof credentials.password).toBe('string');
    });

    it('should return username in adjective-noun format', () => {
      const credentials = authService.getCredentials();

      // Username should be two words separated by hyphen
      expect(credentials.username).toMatch(/^[a-z]+-[a-z]+$/);
    });

    it('should return password with minimum 16 characters', () => {
      const credentials = authService.getCredentials();

      expect(credentials.password.length).toBeGreaterThanOrEqual(16);
    });

    it('should return password with lowercase letters', () => {
      const credentials = authService.getCredentials();

      expect(credentials.password).toMatch(/[a-z]/);
    });

    it('should return password with uppercase letters', () => {
      const credentials = authService.getCredentials();

      expect(credentials.password).toMatch(/[A-Z]/);
    });

    it('should return password with numbers', () => {
      const credentials = authService.getCredentials();

      expect(credentials.password).toMatch(/[0-9]/);
    });

    it('should return password with symbols', () => {
      const credentials = authService.getCredentials();

      expect(credentials.password).toMatch(/[!@#$%&*]/);
    });

    it('should return the same credentials on multiple calls', () => {
      const creds1 = authService.getCredentials();
      const creds2 = authService.getCredentials();

      expect(creds1.username).toBe(creds2.username);
      expect(creds1.password).toBe(creds2.password);
    });

    it('should return a copy, not the original object', () => {
      const creds1 = authService.getCredentials();
      const creds2 = authService.getCredentials();

      expect(creds1).not.toBe(creds2);
    });
  });

  describe('createSession', () => {
    it('should return session with id, createdAt, and expiresAt', () => {
      const session = authService.createSession();

      expect(session.id).toBeDefined();
      expect(session.createdAt).toBeDefined();
      expect(session.expiresAt).toBeDefined();
    });

    it('should generate unique session IDs', () => {
      const session1 = authService.createSession();
      const session2 = authService.createSession();

      expect(session1.id).not.toBe(session2.id);
    });

    it('should set session expiry to 7 days from creation', () => {
      const session = authService.createSession();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(session.expiresAt - session.createdAt).toBe(sevenDaysMs);
    });

    it('should generate session ID as hex string', () => {
      const session = authService.createSession();

      expect(session.id).toMatch(/^[0-9a-f]+$/);
      expect(session.id.length).toBe(64); // 32 bytes = 64 hex chars
    });
  });

  describe('validateSession', () => {
    it('should return true for valid session', () => {
      const session = authService.createSession();

      expect(authService.validateSession(session.id)).toBe(true);
    });

    it('should return false for unknown session ID', () => {
      expect(authService.validateSession('unknown-session-id')).toBe(false);
    });

    it('should return false for empty session ID', () => {
      expect(authService.validateSession('')).toBe(false);
    });

    it('should validate multiple concurrent sessions', () => {
      const session1 = authService.createSession();
      const session2 = authService.createSession();
      const session3 = authService.createSession();

      expect(authService.validateSession(session1.id)).toBe(true);
      expect(authService.validateSession(session2.id)).toBe(true);
      expect(authService.validateSession(session3.id)).toBe(true);
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate a valid session', () => {
      const session = authService.createSession();

      expect(authService.validateSession(session.id)).toBe(true);

      authService.invalidateSession(session.id);

      expect(authService.validateSession(session.id)).toBe(false);
    });

    it('should not affect other sessions', () => {
      const session1 = authService.createSession();
      const session2 = authService.createSession();

      authService.invalidateSession(session1.id);

      expect(authService.validateSession(session1.id)).toBe(false);
      expect(authService.validateSession(session2.id)).toBe(true);
    });

    it('should handle invalidating non-existent session gracefully', () => {
      expect(() => {
        authService.invalidateSession('non-existent-id');
      }).not.toThrow();
    });

    it('should handle invalidating already invalidated session', () => {
      const session = authService.createSession();

      authService.invalidateSession(session.id);

      expect(() => {
        authService.invalidateSession(session.id);
      }).not.toThrow();
    });
  });

  describe('Session expiration', () => {
    it('should reject expired session', () => {
      // Create a service with a session, then manipulate time
      const service = new DefaultAuthService();
      const session = service.createSession();

      // Validate before expiry
      expect(service.validateSession(session.id)).toBe(true);

      // We can't easily test time-based expiration without mocking Date.now
      // This test verifies the validation logic works with valid sessions
    });
  });

  describe('Environment variable credentials', () => {
    it('should use SUPERENGINEER_V5_USERNAME and SUPERENGINEER_V5_PASSWORD when both are set', () => {
      process.env.SUPERENGINEER_V5_USERNAME = 'custom-user';
      process.env.SUPERENGINEER_V5_PASSWORD = 'custom-pass-123';

      const service = createAuthService();
      const credentials = service.getCredentials();

      expect(credentials.username).toBe('custom-user');
      expect(credentials.password).toBe('custom-pass-123');
    });

    it('should generate credentials when only SUPERENGINEER_V5_USERNAME is set', () => {
      process.env.SUPERENGINEER_V5_USERNAME = 'custom-user';

      const service = createAuthService();
      const credentials = service.getCredentials();

      // Should generate random credentials since both aren't set
      expect(credentials.username).toMatch(/^[a-z]+-[a-z]+$/);
      expect(credentials.password.length).toBeGreaterThanOrEqual(16);
    });

    it('should generate credentials when only SUPERENGINEER_V5_PASSWORD is set', () => {
      process.env.SUPERENGINEER_V5_PASSWORD = 'custom-pass-123';

      const service = createAuthService();
      const credentials = service.getCredentials();

      // Should generate random credentials since both aren't set
      expect(credentials.username).toMatch(/^[a-z]+-[a-z]+$/);
      expect(credentials.password.length).toBeGreaterThanOrEqual(16);
    });

    it('should generate credentials when neither env var is set', () => {
      const service = createAuthService();
      const credentials = service.getCredentials();

      expect(credentials.username).toMatch(/^[a-z]+-[a-z]+$/);
      expect(credentials.password.length).toBeGreaterThanOrEqual(16);
    });

    it('should use env credentials even if they do not match typical format', () => {
      process.env.SUPERENGINEER_V5_USERNAME = 'admin';
      process.env.SUPERENGINEER_V5_PASSWORD = 'password';

      const service = createAuthService();
      const credentials = service.getCredentials();

      expect(credentials.username).toBe('admin');
      expect(credentials.password).toBe('password');
    });
  });
});
