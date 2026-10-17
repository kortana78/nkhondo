// Server config from env. Single instance first; see ONLINE.md for scaling.
export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  adminKey: string;
  allowedOrigins: string[];
  tickMs: number;
  clientUrl: string;
}

function origins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:4173';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 8080),
    databaseUrl: process.env.DATABASE_URL ?? '',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    adminKey: process.env.ADMIN_KEY ?? '',
    allowedOrigins: origins(),
    tickMs: Number(process.env.NKHONDO_TICK_MS ?? 50),
    clientUrl: process.env.CLIENT_URL ?? '',
  };
}
