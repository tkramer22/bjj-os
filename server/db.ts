import { drizzle } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { Pool, neonConfig } from "@neondatabase/serverless";
import postgres from "postgres";
import ws from "ws";
import * as schema from "@shared/schema";

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL is not set");
}

// Detect if using Supabase pooler (pooler.supabase.com) vs Neon
const isSupabasePooler = databaseUrl.includes('pooler.supabase.com');

let db: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePostgres>;
let pool: Pool | null = null;
let postgresClient: ReturnType<typeof postgres> | null = null;

if (isSupabasePooler) {
  // ═══════════════════════════════════════════════════════════════
  // SUPABASE POOLER CONNECTION (Standard TCP)
  // ═══════════════════════════════════════════════════════════════
  // Use postgres-js for Supabase pooler connections (IPv4 compatible)
  // This avoids the WebSocket/IPv6 issues with Neon driver
  // ═══════════════════════════════════════════════════════════════
  
  postgresClient = postgres(databaseUrl, {
    max: 10,                        // Max 10 connections (Supabase limit)
    idle_timeout: 30,               // Close idle connections after 30s
    connect_timeout: 10,            // Connection timeout
    prepare: false,                 // Supabase transaction mode doesn't support prepared statements
  });
  
  db = drizzlePostgres(postgresClient, { schema });
  console.log('🔗 Using Supabase pooler connection (postgres-js)');
  
} else {
  // ═══════════════════════════════════════════════════════════════
  // NEON SERVERLESS CONNECTION (WebSocket)
  // ═══════════════════════════════════════════════════════════════
  // Enable WebSocket for Neon connections (required for serverless)
  neonConfig.webSocketConstructor = ws;
  
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,                        // Max 10 connections
    maxUses: Infinity,              // Reuse connections indefinitely
    allowExitOnIdle: false,         // Keep pool alive even when idle
    maxLifetimeSeconds: 0,          // Don't expire connections by age
    idleTimeoutMillis: 30000,       // Close idle connections after 30s
  });
  
  pool.on('error', (err: Error) => {
    console.error('❌ Unexpected database pool error:', err.message);
    console.error('   Pool will attempt to recover automatically...');
  });
  
  db = drizzle(pool, { schema });
  console.log('🔗 Using Neon serverless connection (WebSocket)');
}

export { db, pool };

// ═══════════════════════════════════════════════════════════════
// DATABASE HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await db.execute('SELECT NOW() as time, version() as version');
    console.log('✅ Database connection healthy');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION POOL MONITORING
// ═══════════════════════════════════════════════════════════════

export function getPoolStats() {
  if (pool) {
    return {
      total: pool.totalCount,       // Total connections created
      idle: pool.idleCount,         // Idle connections available
      waiting: pool.waitingCount    // Queries waiting for a connection
    };
  }
  return {
    total: 0,
    idle: 0,
    waiting: 0,
    note: 'Using postgres-js (stats not available)'
  };
}

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

async function closeConnections() {
  console.log('📊 Closing database connections gracefully...');
  if (pool) {
    await pool.end();
  }
  if (postgresClient) {
    await postgresClient.end();
  }
  console.log('✅ Database connections closed');
}

process.on('SIGTERM', async () => {
  await closeConnections();
});

process.on('SIGINT', async () => {
  await closeConnections();
  process.exit(0);
});
