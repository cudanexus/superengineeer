/**
 * Authentication Service
 * Handles credential generation and session management
 */

import { randomBytes } from 'crypto';
import { generateRandomUsername } from '../utils/word-lists';

export interface Credentials {
  username: string;
  password: string;
}

export interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthService {
  getCredentials(): Credentials;
  createSession(): Session;
  validateSession(sessionId: string): boolean;
  invalidateSession(sessionId: string): void;
}

const PASSWORD_LENGTH = 16;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Character sets for password generation
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const NUMBERS = '23456789';
const SYMBOLS = '!@#$%&*';

/**
 * Generate a strong random password with all character classes
 */
function generatePassword(length: number = PASSWORD_LENGTH): string {
  const allChars = LOWERCASE + UPPERCASE + NUMBERS + SYMBOLS;
  const bytes = randomBytes(length + 10); // Extra bytes for selection

  // Ensure at least one char from each class
  const required = [
    LOWERCASE.charAt(bytes[0]! % LOWERCASE.length),
    UPPERCASE.charAt(bytes[1]! % UPPERCASE.length),
    NUMBERS.charAt(bytes[2]! % NUMBERS.length),
    SYMBOLS.charAt(bytes[3]! % SYMBOLS.length)
  ];

  // Fill remaining with random from all chars
  const remaining: string[] = [];

  for (let i = 4; i < length; i++) {
    remaining.push(allChars.charAt(bytes[i]! % allChars.length));
  }

  // Combine and shuffle using Fisher-Yates
  const combined = [...required, ...remaining];

  for (let i = combined.length - 1; i > 0; i--) {
    const j = bytes[i + 4]! % (i + 1);
    [combined[i], combined[j]] = [combined[j]!, combined[i]!];
  }

  return combined.join('');
}

/**
 * Get credentials from environment variables or generate new ones
 * If SUPERENGINEER_V5_USERNAME and SUPERENGINEER_V5_PASSWORD are set, use those
 */
function getOrGenerateCredentials(): Credentials {
  const envUsername = process.env.SUPERENGINEER_V5_USERNAME;
  const envPassword = process.env.SUPERENGINEER_V5_PASSWORD;

  if (envUsername && envPassword) {
    return { username: envUsername, password: envPassword };
  }

  return {
    username: generateRandomUsername(),
    password: generatePassword()
  };
}

/**
 * Default implementation of AuthService
 * Uses SUPERENGINEER_V5_USERNAME/SUPERENGINEER_V5_PASSWORD env vars if set,
 * otherwise regenerates credentials on each instantiation (server restart)
 * Sessions stored in memory only
 */
export class DefaultAuthService implements AuthService {
  private credentials: Credentials;
  private sessions: Map<string, Session> = new Map();

  constructor() {
    this.credentials = getOrGenerateCredentials();
  }

  getCredentials(): Credentials {
    return { ...this.credentials };
  }

  createSession(): Session {
    const now = Date.now();
    const session: Session = {
      id: randomBytes(32).toString('hex'),
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS
    };

    this.sessions.set(session.id, session);
    return session;
  }

  validateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return false;
    }

    return true;
  }

  invalidateSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

/**
 * Create the default auth service instance
 */
export function createAuthService(): AuthService {
  return new DefaultAuthService();
}
