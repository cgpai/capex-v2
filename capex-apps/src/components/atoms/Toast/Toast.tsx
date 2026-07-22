import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  type: 'success' | 'error';
  title?: string;
  onClose: () => void;
  /** Auto-dismiss ms (default 5500) */
  durationMs?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  title,
  onClose,
  durationMs = 5500,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setIsVisible(true);
    const dismiss = window.setTimeout(() => {
      setIsVisible(false);
      window.setTimeout(() => onCloseRef.current(), 280);
    }, durationMs);
    return () => clearTimeout(dismiss);
  }, [durationMs]);

  const defaultTitle = type === 'success' ? 'Berhasil' : 'Gagal';
  const displayTitle = title?.trim() || defaultTitle;

  const isSuccess = type === 'success';
  const shellClass = isSuccess
    ? 'border-emerald-400/50 bg-gradient-to-br from-emerald-50 via-white to-teal-50/90 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/30 shadow-emerald-500/15'
    : 'border-rose-400/50 bg-gradient-to-br from-rose-50 via-white to-orange-50/80 dark:from-rose-950/40 dark:via-slate-900 dark:to-rose-950/30 shadow-rose-500/15';

  const iconWrap = isSuccess
    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/35'
    : 'bg-rose-500 text-white shadow-lg shadow-rose-500/35';

  const handleClose = () => {
    setIsVisible(false);
    window.setTimeout(() => onCloseRef.current(), 280);
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-[200] w-[min(100vw-1.5rem,420px)] pointer-events-none flex justify-end`}
      role="alert"
    >
      <div
        className={`pointer-events-auto rounded-2xl border-2 shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ease-out ${shellClass} ${
          isVisible ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-8 scale-95'
        }`}
      >
        <div className="flex gap-3 p-4 pr-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}
          >
            {isSuccess ? (
              <CheckCircle2 className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            ) : (
              <XCircle className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p
              className={`text-sm font-bold tracking-tight ${
                isSuccess ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'
              }`}
            >
              {displayTitle}
            </p>
            <p className="mt-1 text-sm leading-snug text-slate-700 dark:text-slate-200">{message}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-black/5 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-slate-100 transition-colors"
            aria-label="Tutup notifikasi"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="h-1 w-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full origin-left ${isSuccess ? 'bg-emerald-500' : 'bg-rose-500'}`}
            style={{
              animation: `toast-progress-shrink ${durationMs}ms linear forwards`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
