export type LogoutDto = {
  allDevices?: boolean;
};

export function parseLogoutDto(body: unknown): LogoutDto {
  if (!body || typeof body !== 'object') return {};
  const allDevices = (body as { allDevices?: unknown }).allDevices;
  return { allDevices: allDevices === true };
}
