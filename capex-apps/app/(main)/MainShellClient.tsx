"use client";

import dynamic from "next/dynamic";
import { PermissionsProvider } from "@/contexts/PermissionsContext";

const App = dynamic(() => import("@/App"), { ssr: false });

type Props = {
  children: React.ReactNode;
  /** From server cookies — skip /api/auth/me when false (clean login page). */
  hasSessionCookies: boolean;
};

export function MainShellClient({ children, hasSessionCookies }: Props) {
  return (
    <PermissionsProvider>
      <App hasSessionCookies={hasSessionCookies} />
      {children}
    </PermissionsProvider>
  );
}
