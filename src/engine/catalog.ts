import fs from 'node:fs';
import path from 'node:path';
import type { Catalog } from '../shared/types.ts';

let cachedCatalog: { path: string; raw: string; data: Catalog } | null = null;

export function resolveCatalogPath(): string {
  if (process.env.VIGIL_CATALOG) {
    return path.resolve(process.env.VIGIL_CATALOG);
  }
  return path.resolve(process.cwd(), 'shared', 'catalog.json');
}

export function loadCatalog(forceReload = false): Catalog {
  const catalogPath = resolveCatalogPath();
  if (!forceReload && cachedCatalog && cachedCatalog.path === catalogPath) {
    return cachedCatalog.data;
  }
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Vigil catalog not found at ${catalogPath}. Set VIGIL_CATALOG or ensure shared/catalog.json exists.`);
  }
  const raw = fs.readFileSync(catalogPath, 'utf-8');
  const data = JSON.parse(raw) as Catalog;
  cachedCatalog = { path: catalogPath, raw, data };
  return data;
}

export function loadCatalogRaw(): string {
  const catalogPath = resolveCatalogPath();
  if (cachedCatalog && cachedCatalog.path === catalogPath) {
    return cachedCatalog.raw;
  }
  loadCatalog();
  return cachedCatalog!.raw;
}
