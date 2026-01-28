/**
 * Authentication Routes
 * Handles login, logout, and auth status endpoints
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth-service';
import { COOKIE_NAME, parseCookie } from '../middleware/auth-middleware';

export interface AuthRouterDependencies {
  authService: AuthService;
}

interface LoginRequest {
  username?: string;
  password?: string;
}

/**
 * Create the auth router with login/logout/status endpoints
 */
export function createAuthRouter(deps: AuthRouterDependencies): Router {
  const router = Router();
  const { authService } = deps;

  /**
   * POST /api/auth/login
   * Validate credentials and set session cookie
   */
  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body as LoginRequest;
    const credentials = authService.getCredentials();

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    if (username !== credentials.username || password !== credentials.password) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const session = authService.createSession();

    res.cookie(COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // Local app, no HTTPS
      maxAge: session.expiresAt - session.createdAt
    });

    res.json({ success: true });
  });

  /**
   * POST /api/auth/logout
   * Clear session cookie and invalidate session
   */
  router.post('/logout', (req: Request, res: Response) => {
    const sessionId = parseCookie(req.headers.cookie, COOKIE_NAME);

    if (sessionId) {
      authService.invalidateSession(sessionId);
    }

    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
  });

  /**
   * GET /api/auth/status
   * Check if current session is authenticated
   */
  router.get('/status', (req: Request, res: Response) => {
    const sessionId = parseCookie(req.headers.cookie, COOKIE_NAME);
    const authenticated = sessionId
      ? authService.validateSession(sessionId)
      : false;

    res.json({ authenticated });
  });

  return router;
}
