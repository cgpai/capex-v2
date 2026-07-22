import { cookies } from "next/headers";
import { MainShellClient } from "./MainShellClient";

const ACCESS_COOKIE = "capex_access";
const REFRESH_COOKIE = "capex_refresh";

function readHasSessionCookies(cookieStore: Awaited<ReturnType<typeof cookies>>): boolean {
  return Boolean(
    cookieStore.get(ACCESS_COOKIE)?.value || cookieStore.get(REFRESH_COOKIE)?.value,
  );
}

/**
 * Shell yang tetap hidup saat navigasi antar path. `App` tidak boleh di `page.tsx`
 * karena setiap ganti URL akan unmount/remount page → state `currentUser` hilang
 * dan layar login muncul lagi.
 */
export default async function MainShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hasSessionCookies = readHasSessionCookies(await cookies());

  return (
    <MainShellClient hasSessionCookies={hasSessionCookies}>
      {children}
    </MainShellClient>
  );
}
