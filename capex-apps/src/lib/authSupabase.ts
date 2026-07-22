/**
 * Password helpers — backend-only (no browser Supabase client).
 */

import { getPasswordResetRedirectUrl } from './auth/passwordResetRedirect';
import { changePasswordBackend, requestPasswordResetBackend } from './auth/authApi';

export const signInWithEmailPassword = async (
  _email: string,
  _password: string,
): Promise<{ user: null; error: Error | null }> => {
  return {
    user: null,
    error: new Error('Gunakan login backend (/auth/login).'),
  };
};

export const resetPasswordForEmail = async (
  email: string,
): Promise<{ error: Error | null }> => {
  const result = await requestPasswordResetBackend(email, getPasswordResetRedirectUrl());
  return { error: result.error ? new Error(result.error) : null };
};

export const updatePassword = async (
  newPassword: string,
  currentPassword: string,
  userId: number,
): Promise<{ error: Error | null }> => {
  const result = await changePasswordBackend(userId, currentPassword, newPassword);
  return { error: result.error ? new Error(result.error) : null };
};

export const isRecoveryFromUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const queryParams = new URLSearchParams(window.location.search);
  return hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';
};
