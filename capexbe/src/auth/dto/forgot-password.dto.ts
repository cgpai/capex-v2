export class ForgotPasswordDto {
  email!: string;
  redirectTo?: string;
}

export function validateForgotPasswordDto(body: unknown): ForgotPasswordDto {
  if (body == null || typeof body !== 'object') {
    throw new Error('Invalid body');
  }
  const o = body as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
  const redirectTo =
    typeof o.redirectTo === 'string' && o.redirectTo.trim()
      ? o.redirectTo.trim()
      : undefined;
  if (!email || !email.includes('@') || email.length > 320) {
    throw new Error('Invalid email');
  }
  if (redirectTo && redirectTo.length > 2048) {
    throw new Error('Invalid redirectTo');
  }
  return { email, redirectTo };
}
