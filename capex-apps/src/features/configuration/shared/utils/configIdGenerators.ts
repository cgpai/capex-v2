export function generateConfigEntityId(prefix: string, name: string): string {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return `${prefix}-${slug}-${Date.now()}`;
}
