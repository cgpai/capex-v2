'use client';

import { useCallback, useState } from 'react';

type UseConfigEntityModalOptions<T extends object> = {
  defaultDraft: Partial<T>;
};

export function useConfigEntityModal<T extends object>({
  defaultDraft,
}: UseConfigEntityModalOptions<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<T> | null>(null);

  const open = useCallback(
    (item: Partial<T> | null = null) => {
      setDraft(item ?? { ...defaultDraft });
      setIsOpen(true);
    },
    [defaultDraft],
  );

  const close = useCallback(() => {
    setDraft(null);
    setIsOpen(false);
  }, []);

  const patchDraft = useCallback((partial: Partial<T>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : partial));
  }, []);

  const isEditing = Boolean(draft && 'id' in draft && draft.id);

  return { isOpen, draft, open, close, patchDraft, isEditing };
}
