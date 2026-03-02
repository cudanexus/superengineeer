import http from 'http';
import https from 'https';
import { URL } from 'url';
import { AbilityCatalogItem } from '../repositories';
import { AppError } from '../utils';

interface CatalogApiResponse<T> {
  abilities?: T;
  ability?: AbilityCatalogItem;
  error?: string;
}

interface CatalogRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  authHeader?: string;
}

function getCatalogBaseUrl(): string {
  const raw = String(
    process.env['ABILITIES_CATALOG_BASE_URL']
    || process.env['SUPER_WEB_BACKEND_URL']
    || process.env['BACKEND_PUBLIC_URL']
    || 'http://localhost:3005',
  ).trim();

  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function buildCatalogUrl(pathname: string): URL {
  const base = new URL(getCatalogBaseUrl());
  const basePath = base.pathname.replace(/\/+$/, '');
  const hasApiPrefix = basePath === '/api' || basePath.endsWith('/api');
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const joinedPath = hasApiPrefix
    ? `${basePath}${normalizedPath}`
    : `${basePath}/api${normalizedPath}`;

  base.pathname = joinedPath;
  base.search = '';
  base.hash = '';
  return base;
}

function parseErrorMessage(body: string, fallback: string): string {
  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body) as CatalogApiResponse<AbilityCatalogItem[]>;
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // Ignore JSON parse failures for error message extraction.
  }

  return fallback;
}

async function requestCatalog<T>(options: CatalogRequestOptions): Promise<T> {
  const url = buildCatalogUrl(options.path);
  const transport = url.protocol === 'https:' ? https : http;
  const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload).toString();
  }

  if (options.authHeader) {
    headers['Authorization'] = options.authHeader;
  }

  return await new Promise<T>((resolve, reject) => {
    const req = transport.request(url, {
      method: options.method,
      headers,
    }, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const statusCode = res.statusCode || 500;

        if (statusCode < 200 || statusCode >= 300) {
          reject(new AppError(
            parseErrorMessage(raw, `Abilities catalog request failed with status ${statusCode}`),
            statusCode,
            'ABILITIES_CATALOG_ERROR',
          ));
          return;
        }

        if (!raw.trim()) {
          resolve({} as T);
          return;
        }

        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new AppError('Invalid abilities catalog response payload', 502, 'ABILITIES_CATALOG_ERROR'));
        }
      });
    });

    req.on('error', (error) => {
      reject(new AppError(`Failed to reach abilities catalog backend: ${error.message}`, 502, 'ABILITIES_CATALOG_ERROR'));
    });

    if (payload !== undefined) {
      req.write(payload);
    }

    req.end();
  });
}

export async function listCatalogAbilities(includeDisabled = false, authHeader?: string): Promise<AbilityCatalogItem[]> {
  const endpoint = includeDisabled ? '/abilities/catalog/all' : '/abilities/catalog';
  const response = await requestCatalog<CatalogApiResponse<AbilityCatalogItem[]>>({
    method: 'GET',
    path: endpoint,
    authHeader,
  });

  return Array.isArray(response.abilities) ? response.abilities : [];
}

export async function createCatalogAbility(
  ability: AbilityCatalogItem,
  authHeader?: string,
): Promise<AbilityCatalogItem> {
  const response = await requestCatalog<CatalogApiResponse<AbilityCatalogItem[]>>({
    method: 'POST',
    path: '/abilities/catalog',
    body: ability,
    authHeader,
  });

  return response.ability || ability;
}

export async function updateCatalogAbility(
  abilityId: string,
  updates: Partial<AbilityCatalogItem>,
  authHeader?: string,
): Promise<AbilityCatalogItem> {
  const response = await requestCatalog<CatalogApiResponse<AbilityCatalogItem[]>>({
    method: 'PUT',
    path: `/abilities/catalog/${encodeURIComponent(abilityId)}`,
    body: updates,
    authHeader,
  });

  if (!response.ability) {
    throw new AppError('Invalid abilities catalog update response', 502, 'ABILITIES_CATALOG_ERROR');
  }

  return response.ability;
}

export async function deleteCatalogAbility(abilityId: string, authHeader?: string): Promise<void> {
  await requestCatalog<Record<string, unknown>>({
    method: 'DELETE',
    path: `/abilities/catalog/${encodeURIComponent(abilityId)}`,
    authHeader,
  });
}
