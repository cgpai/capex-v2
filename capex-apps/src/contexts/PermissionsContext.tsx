import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchConfigurationSlicesFromBackend } from '../services/configurationApi';
import { isCapexBeConfigured } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';
import { getAccessTokenForBackend } from '../lib/authSession';
import { useAuthStore } from '../stores/authStore';
import type { ArchetypeConfig, HospitalUnitConfig } from '../types';

interface ScopeClassification {
    archetypeNames: Set<string>;
    huNames: Set<string>;
    archetypeIdToName: Map<string, string>;
    huIdToName: Map<string, string>;
}

const defaultClassification: ScopeClassification = {
    archetypeNames: new Set(),
    huNames: new Set(),
    archetypeIdToName: new Map(),
    huIdToName: new Map(),
};

const PermissionsContext = createContext<ScopeClassification>(defaultClassification);

async function loadScopeMasterConfig(userId: number): Promise<{
    archetypes: ArchetypeConfig[];
    hus: HospitalUnitConfig[];
}> {
    if (!isCapexBeConfigured()) {
        return { archetypes: [], hus: [] };
    }

    const accessToken = useBackendSession()
        ? null
        : await getAccessTokenForBackend();
    const pack = await fetchConfigurationSlicesFromBackend(accessToken, userId, [
        'archetypes',
        'hospitalUnits',
    ]);

    return {
        archetypes: Array.isArray(pack?.archetypes) ? pack.archetypes : [],
        hus: Array.isArray(pack?.hospitalUnits) ? pack.hospitalUnits : [],
    };
}

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [classification, setClassification] = useState<ScopeClassification>(defaultClassification);
    const authStatus = useAuthStore((s) => s.status);
    const sessionUserId = useAuthStore((s) =>
        s.status === 'authenticated' && s.user?.id ? s.user.id : null,
    );

    useEffect(() => {
        if (authStatus !== 'authenticated' || sessionUserId == null) {
            setClassification(defaultClassification);
            return;
        }

        let cancelled = false;
        void (async () => {
            try {
                const { archetypes, hus } = await loadScopeMasterConfig(sessionUserId);
                if (cancelled || (!archetypes.length && !hus.length)) return;
                setClassification({
                    archetypeNames: new Set(archetypes.map(a => a.name)),
                    huNames: new Set(hus.map(h => h.name)),
                    archetypeIdToName: new Map(archetypes.map(a => [String(a.id), a.name])),
                    huIdToName: new Map(hus.map(h => [String(h.id), h.name])),
                });
            } catch (e) {
                void e;
            }
        })();
        return () => { cancelled = true; };
    }, [authStatus, sessionUserId]);

    return (
        <PermissionsContext.Provider value={classification}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const useScopeClassification = (): ScopeClassification => useContext(PermissionsContext);
