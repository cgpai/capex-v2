export function requireName(name: string | undefined | null): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}
