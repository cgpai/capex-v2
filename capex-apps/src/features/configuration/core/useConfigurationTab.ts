'use client';

import { useState, useEffect } from 'react';
import {
  CONFIGURATION_ACTIVE_TAB_KEY,
  CONFIGURATION_TABS,
  type ConfigurationTab,
} from '@/features/configuration/core/configurationPageUtils';

export function useConfigurationTab(): [ConfigurationTab, (tab: ConfigurationTab) => void] {
  const [activeTab, setActiveTab] = useState<ConfigurationTab>(() => {
    if (typeof window === 'undefined') return 'Users & Roles';
    try {
      const raw = window.localStorage.getItem(CONFIGURATION_ACTIVE_TAB_KEY);
      if (raw && (CONFIGURATION_TABS as readonly string[]).includes(raw)) {
        return raw as ConfigurationTab;
      }
    } catch {
      /* noop */
    }
    return 'Users & Roles';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIGURATION_ACTIVE_TAB_KEY, activeTab);
    } catch {
      /* noop */
    }
  }, [activeTab]);

  return [activeTab, setActiveTab];
}
