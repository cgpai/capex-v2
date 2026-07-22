'use client';

import React, { useEffect, useState, memo } from 'react';
import type { User } from '../types';
import { fetchAuthMe, invalidateAuthProbeCache, loginWithBackend, logoutBackend, setSessionCookieHint, clearServerAuthCookies } from '../lib/auth/authApi';
import { useBackendSession } from '../lib/auth/authConstants';
import { isDemoMode } from '../lib/auth/demoMode';
import { isUserSuperAdmin } from '../lib/userRoleResolution';
import { writeCachedAuthUser } from '../lib/authSessionCache';

function isSuperAdminSession(user: User | null, roleSlugs: string[]): boolean {
  if (user && isUserSuperAdmin(user, [])) return true;
  return roleSlugs.some((role) => {
    const n = String(role ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    return n === 'superadmin' || n === 'superadministrator';
  });
}

export const SuperAdminLoginPage = memo(function SuperAdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!useBackendSession()) {
        if (!cancelled) setCheckingSession(false);
        return;
      }
      try {
        const me = await fetchAuthMe();
        if (cancelled) return;
        if (me?.authenticated && me.user) {
          window.location.replace('/');
          return;
        }
      } catch {
        /* stay on login */
      }
      if (!cancelled) setCheckingSession(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Masukkan email Anda.');
      return;
    }
    if (!password) {
      setError('Masukkan password Anda.');
      return;
    }
    if (!useBackendSession()) {
      setError('Backend session belum diaktifkan.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await loginWithBackend(email.trim().toLowerCase(), password);
      if (!result.user) {
        setError(result.error || 'Email atau password salah.');
        return;
      }

      if (!isDemoMode() && !isSuperAdminSession(result.user, result.roles)) {
        await logoutBackend({ allDevices: false });
        setError('Akses ditolak. Halaman ini hanya untuk Super Admin.');
        return;
      }

      setSessionCookieHint(true);
      writeCachedAuthUser(result.user);
      invalidateAuthProbeCache();

      const me = await fetchAuthMe();
      if (!me?.authenticated || !me.user) {
        setError('Login berhasil tapi sesi tidak tersimpan. Clear cookies lalu coba lagi.');
        void clearServerAuthCookies();
        return;
      }

      window.location.replace('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan. Coba lagi.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-siloam-bg p-4 font-inter">
        <div className="text-sm text-siloam-text-secondary">Memeriksa sesi...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-siloam-bg p-4 font-inter">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-siloam-border">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-siloam-blue tracking-tight mb-6">Capex Pro</h1>
          <h2 className="text-2xl font-bold text-siloam-text-primary">
            {isDemoMode() ? 'Demo Login' : 'Super Admin'}
          </h2>
          <p className="text-siloam-text-secondary text-sm mt-2">
            {isDemoMode()
              ? 'Login password untuk demo (LAN / localhost). Semua role boleh masuk.'
              : 'Login manual dengan email dan password'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="sa-email" className="block text-sm font-medium text-siloam-text-primary mb-1">
              Email
            </label>
            <input
              id="sa-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-2.5 border border-siloam-border rounded-xl focus:ring-2 focus:ring-siloam-blue focus:outline-none disabled:opacity-50"
              placeholder="superadmin@example.com"
            />
          </div>

          <div>
            <label htmlFor="sa-password" className="block text-sm font-medium text-siloam-text-primary mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="sa-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full px-4 py-2.5 pr-11 border border-siloam-border rounded-xl focus:ring-2 focus:ring-siloam-blue focus:outline-none disabled:opacity-50"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={isLoading}
                className="absolute inset-y-0 right-0 px-3 text-siloam-text-secondary hover:text-siloam-text-primary disabled:opacity-50"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger/10 p-3 rounded-lg flex items-center">
              <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-siloam-blue text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Memproses...
              </>
            ) : isDemoMode() ? (
              'Sign in (Demo)'
            ) : (
              'Sign in as Super Admin'
            )}
          </button>
        </form>
      </div>
    </div>
  );
});

SuperAdminLoginPage.displayName = 'SuperAdminLoginPage';
