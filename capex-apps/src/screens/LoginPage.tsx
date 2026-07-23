'use client';

import React, { useState, memo } from 'react';
import {
  clearServerAuthCookies,
  fetchAuthMe,
  invalidateAuthProbeCache,
  loginWithBackend,
  setSessionCookieHint,
} from '../lib/auth/authApi';
import { useBackendSession } from '../lib/auth/authConstants';
import { writeCachedAuthUser } from '../lib/authSessionCache';
import { ExternalLink } from '@/components/atoms/ExternalLink/ExternalLink';

const ADMIN_WHATSAPP = '6282230353419';

function CapexProLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3485B4] to-[#2BBBAD] shadow-md"
        aria-hidden
      >
        <svg viewBox="0 0 32 32" className="h-7 w-7 text-white" fill="none">
          <path
            d="M16 4l2.2 5.4L24 11l-4.5 3.8L21 21l-5-3.2L11 21l1.5-6.2L8 11l5.8-1.6L16 4z"
            fill="currentColor"
            opacity="0.95"
          />
          <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
        </svg>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#4CAF50] text-[8px] font-bold text-white shadow">
          $
        </span>
      </div>
      <div className="leading-tight">
        <span className="text-xl font-extrabold tracking-tight text-[#1e4a7a]">Capex</span>{' '}
        <span className="text-xl font-extrabold tracking-tight text-[#2BBBAD]">Pro</span>
      </div>
    </div>
  );
}

export const LoginPage = memo(function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

      setSessionCookieHint(true);
      writeCachedAuthUser(result.user);
      invalidateAuthProbeCache();

      const me = await fetchAuthMe();
      if (!me?.authenticated || !me.user) {
        setError('Login berhasil tapi sesi tidak tersimpan. Pastikan capexbe berjalan, lalu coba lagi.');
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

  const adminWhatsAppUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(
    'Halo, saya ingin meminta akses akun Capex Pro.',
  )}`;

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/login-bg.png')" }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-[#3485B4]/30"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-screen w-full items-center justify-end px-4 py-8 sm:px-8 lg:px-16 xl:px-24">
        <div className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/70 bg-[rgba(220,240,255,0.88)] p-8 shadow-[0_20px_60px_-15px_rgba(30,74,122,0.35)] backdrop-blur-md sm:p-10">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%233485B4'%3E%3Cpath d='M38 20h4v12h12v4H42v12h-4V36H26v-4h12V20z'/%3E%3Ccircle cx='16' cy='60' r='3'/%3E%3Ccircle cx='64' cy='16' r='2.5'/%3E%3Cpath d='M58 52c0-4 3-7 7-7s7 3 7 7-3 7-7 7-7-3-7-7zm3.5 0a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z'/%3E%3C/g%3E%3C/svg%3E")`,
            }}
            aria-hidden
          />

          <div className="relative">
            <CapexProLogo className="mb-6" />

            <h1 className="mb-2 text-lg font-extrabold uppercase leading-snug tracking-wide text-[#1e4a7a] sm:text-xl">
              Log Masuk: Aplikasi Procurement Capex RS
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-[#4a6a8a]">
              Selamat Datang di Capex Pro. Kelola Anggaran &amp; Pengadaan Alat Kesehatan Rumah Sakit
              Anda.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-[#1e4a7a]">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-xl border border-[#b8d4e8] bg-white/90 px-4 py-2.5 text-sm text-[#1e4a7a] focus:outline-none focus:ring-2 focus:ring-[#3485B4] disabled:opacity-60"
                  placeholder="nama@hospital.com"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-[#1e4a7a]">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-[#b8d4e8] bg-white/90 px-4 py-2.5 pr-11 text-sm text-[#1e4a7a] focus:outline-none focus:ring-2 focus:ring-[#3485B4] disabled:opacity-60"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={isLoading}
                    className="absolute inset-y-0 right-0 px-3 text-[#4a6a8a] hover:text-[#1e4a7a] disabled:opacity-50"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50/90 p-3 text-sm text-danger">
                  <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#3485B4] to-[#2BBBAD] px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-[#3485B4]/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Memproses...
                  </>
                ) : (
                  'Masuk'
                )}
              </button>
            </form>

            <p className="pt-4 text-center text-sm text-[#4a6a8a]">
              Belum punya akun?{' '}
              <ExternalLink
                href={adminWhatsAppUrl}
                className="font-bold text-[#1e4a7a] underline-offset-2 hover:underline"
              >
                Hubungi Admin
              </ExternalLink>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

LoginPage.displayName = 'LoginPage';
