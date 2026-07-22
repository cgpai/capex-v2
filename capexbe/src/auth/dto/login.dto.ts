export class LoginDto {
  email!: string;
  password!: string;
}

export function validateLoginDto(body: unknown): LoginDto {
  if (body == null || typeof body !== 'object') {
    throw new Error('Invalid body');
  }
  const o = body as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
  const password = typeof o.password === 'string' ? o.password : '';
  if (!email || !email.includes('@') || email.length > 320) {
    throw new Error('Invalid email');
  }
  if (!password || password.length > 256) {
    throw new Error('Invalid password');
  }
  return { email, password };
}
