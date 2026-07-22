type AuthFailureListener = () => void;

let listener: AuthFailureListener | null = null;

/** Register global handler invoked when refresh fails and session is invalid. */
export function registerAuthFailureHandler(fn: AuthFailureListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function notifyAuthFailure(): void {
  listener?.();
}
