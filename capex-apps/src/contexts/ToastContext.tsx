import React, { createContext, useContext, ReactNode } from 'react';

export type ToastType = 'success' | 'error';

export interface ShowToastOptions {
  title?: string;
}

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType, options?: ShowToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (_message: string, _type?: ToastType, _options?: ShowToastOptions) => {},
    };
  }
  return ctx;
};

interface ToastProviderProps {
  children: ReactNode;
  showToast: (message: string, type?: ToastType, options?: ShowToastOptions) => void;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children, showToast }) => {
  const value = React.useMemo<ToastContextValue>(
    () => ({
      showToast: (msg: string, type?: ToastType, options?: ShowToastOptions) =>
        showToast(msg, type ?? 'success', options),
    }),
    [showToast]
  );
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};
