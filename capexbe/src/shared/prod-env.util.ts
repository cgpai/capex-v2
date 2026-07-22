const DEFAULT_JWT_SECRET = 'change-me-use-openssl-rand-base64-48';

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.SUPABASE_JWT_SECRET?.trim()) missing.push('SUPABASE_JWT_SECRET');
  if (!process.env.JWT_ACCESS_SECRET?.trim()) missing.push('JWT_ACCESS_SECRET');
  if (!process.env.SUPABASE_URL?.trim()) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_ANON_KEY?.trim()) missing.push('SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    throw new Error(`Production startup blocked — missing env: ${missing.join(', ')}`);
  }

  const jwtSecret = process.env.JWT_ACCESS_SECRET!.trim();
  if (jwtSecret === DEFAULT_JWT_SECRET || jwtSecret.length < 32) {
    throw new Error('Production startup blocked — JWT_ACCESS_SECRET must be a strong random value (≥32 chars)');
  }
}

export function isPasswordLoginDisabled(): boolean {
  if (process.env.DISABLE_PASSWORD_LOGIN === 'true') return true;
  return process.env.NODE_ENV === 'production';
}
