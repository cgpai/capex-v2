/** Server-rendered hint: httpOnly access/refresh cookies present in the request. */
let sessionCookieHint = false;

export function setSessionCookieHint(value: boolean): void {
  sessionCookieHint = value;
}

export function hasSessionCookieHint(): boolean {
  return sessionCookieHint;
}
