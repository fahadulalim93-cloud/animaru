import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Gracefully handle missing Prisma client (e.g. prisma generate not run yet)
let _db: PrismaClient | null = null;
try {
  _db = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _db
} catch (e) {
  console.warn('[DB] Prisma client failed to initialize. Bookmarks/History features will be disabled.')
  console.warn('[DB] Run "npx prisma generate" to fix this.')
}

// Create a safe proxy that returns empty results when DB is not available
function createSafeDb(): any {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (_db && prop in _db) {
        return (_db as any)[prop];
      }
      if (!_db) {
        // Return a no-op model proxy when DB is not initialized
        return new Proxy({}, {
          get(_t, method: string) {
            // For create, return a safe default object
            if (method === 'create') return async () => ({ id: '0', userLikes: [] });
            // For findMany, return empty array
            if (method === 'findMany') return async () => [];
            // For upsert, return a minimal object
            if (method === 'upsert') return async () => ({ id: '0' });
            // For delete/deleteMany, return success
            if (method === 'delete' || method === 'deleteMany') return async () => ({ count: 0 });
            // For count, return 0
            if (method === 'count') return async () => 0;
            // Default: return a no-op async function
            return async () => null;
          }
        });
      }
      return undefined;
    }
  };
  return new Proxy({}, handler);
}

export const db = createSafeDb();
