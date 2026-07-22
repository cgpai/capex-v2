import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/authBff';
import { CSRF_COOKIE } from '@/lib/auth/authConstants';

/** Wipe BFF session cookies without calling backend refresh (avoids login race). */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(CSRF_COOKIE);
  return res;
}
