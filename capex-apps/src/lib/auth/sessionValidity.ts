import { fetchAuthMe } from './authApi';

/** Lightweight session check — reuses fetchAuthMe dedupe (no parallel /me). */
export async function isBackendSessionValid(): Promise<boolean> {
  try {
    const me = await fetchAuthMe();
    return me?.authenticated === true;
  } catch {
    return false;
  }
}
