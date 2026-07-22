import React, { useState, useEffect, memo } from 'react';
import { User } from '../types';
import { isAzureSsoEnabled } from '../lib/auth/authConstants';
import { signInWithAzure, consumeOAuthError } from '../lib/authAzure';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

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

export const LoginPage = memo(function LoginPage({ onLogin: _onLogin }: LoginPageProps) {
  const [error, setError] = useState('');
  const [isAzureLoading, setIsAzureLoading] = useState(false);

  const showAzureSso = isAzureSsoEnabled();

  useEffect(() => {
    const oauthError = consumeOAuthError();
    if (oauthError) setError(oauthError);
  }, []);

  const handleAzureLogin = async () => {
    setError('');
    setIsAzureLoading(true);
    try {
      const { error: azureError } = await signInWithAzure();
      if (azureError) {
        setError(azureError.message || 'Gagal memulai login Microsoft. Coba lagi.');
        setIsAzureLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan. Coba lagi.';
      setError(msg);
      setIsAzureLoading(false);
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
            <p className="mb-8 text-sm leading-relaxed text-[#4a6a8a]">
              Selamat Datang di Capex Pro. Kelola Anggaran &amp; Pengadaan Alat Kesehatan Rumah Sakit
              Anda.
            </p>

            <div className="space-y-5">
              {showAzureSso ? (
                <button
                  type="button"
                  onClick={handleAzureLogin}
                  disabled={isAzureLoading}
                  className="group flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#3485B4] to-[#2BBBAD] px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-[#3485B4]/30 transition hover:brightness-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAzureLoading ? (
                    <>
                      <svg
                        className="h-5 w-5 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Mengalihkan...
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 shrink-0" viewBox="0 0 21 21" aria-hidden>
                        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                      </svg>
                      Masuk dengan Microsoft
                      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/40 bg-white/15 transition group-hover:bg-white/25">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <div className="rounded-2xl bg-white/70 p-4 text-center text-sm text-[#4a6a8a]">
                  Login Microsoft SSO belum diaktifkan. Hubungi administrator.
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50/90 p-3 text-sm text-danger">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {error}
                </div>
              )}

              <p className="pt-2 text-center text-sm text-[#4a6a8a]">
                Belum punya akun?{' '}
                <a
                  href={adminWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#1e4a7a] underline-offset-2 hover:underline"
                >
                  Hubungi Admin
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

LoginPage.displayName = 'LoginPage';
