import { useMemo, useCallback } from 'react';
import { useScopeClassification } from '../contexts/PermissionsContext';
import {
    buildConsolidatedPermissionMap,
    canAccessPageWithPermissionMap,
    getPermissionLevelForHierarchy,
    isUserSuperAdmin,
    permissionValues,
} from '../lib/rolePermissionMatrix';
import { canPerformPageDataAction, type PageDataAction } from '../lib/pagePermissions';
import { User, UserRole, PermissionLevel, HierarchyLevel, ArchetypeConfig, HospitalUnitConfig, Page } from '../types';

interface UsePermissionsResult {
    isAllowed: (level: HierarchyLevel, action: PageDataAction) => boolean;
    /** Akses navigasi / buka halaman (Role → Akses Screen). */
    canAccessPage: (page: Page) => boolean;
    /** Aksi data pada halaman (Role → Hak Operasi Data); view = canAccessPage. */
    canOperateOnPage: (page: Page, action: PageDataAction) => boolean;
    getVisibleArchetypes: (allArchetypes: ArchetypeConfig[]) => ArchetypeConfig[];
    getVisibleHUs: (allHUs: HospitalUnitConfig[], selectedArchetype?: ArchetypeConfig) => HospitalUnitConfig[];
    getPermissionFor: (level: HierarchyLevel) => PermissionLevel;
    // FIX: Exposed userScopes in the hook's return type to be used by consumer components.
    userScopes: {
        all: boolean;
        /** Scope names (for legacy + screens that filter by name, e.g. asset.huName). */
        archetypes: Set<string>;
        hus: Set<string>;
        /** Canonical scope IDs as stored in DB ('ARCH-*' / 'HU-*'). */
        archetypeIds: Set<string>;
        huIds: Set<string>;
    };
}

export const usePermissions = (currentUser: User | null, allRoles: UserRole[]): UsePermissionsResult => {
    const scopeClassification = useScopeClassification();

    const userPermissions = useMemo(
        () => buildConsolidatedPermissionMap(currentUser, allRoles),
        [currentUser, allRoles],
    );
    
    const userScopes = useMemo(() => {
        if (!currentUser) {
            return {
                all: false,
                archetypes: new Set<string>(),
                hus: new Set<string>(),
                archetypeIds: new Set<string>(),
                huIds: new Set<string>(),
            };
        }

        if (isUserSuperAdmin(currentUser, allRoles)) {
            return {
                all: true,
                archetypes: new Set<string>(),
                hus: new Set<string>(),
                archetypeIds: new Set<string>(),
                huIds: new Set<string>(),
            };
        }

        if (currentUser.assignments.some(a => a.assignedScopes.includes('All'))) {
            return {
                all: true,
                archetypes: new Set<string>(),
                hus: new Set<string>(),
                archetypeIds: new Set<string>(),
                huIds: new Set<string>(),
            };
        }
        
        const archetypes = new Set<string>();
        const hus = new Set<string>();
        const archetypeIds = new Set<string>();
        const huIds = new Set<string>();
        const { archetypeNames, huNames, archetypeIdToName, huIdToName } = scopeClassification;

        currentUser.assignments.forEach(assignment => {
            assignment.assignedScopes.forEach(scope => {
                if (!scope) return;
                if (scope === 'All') return;

                // New canonical: DB stores IDs (ARCH-.. / HU-..). Convert to names for UI filtering.
                const scopeKey = String(scope);
                if (scopeKey.startsWith('ARCH-')) {
                    archetypeIds.add(scopeKey);
                    const name = archetypeIdToName.get(scopeKey);
                    archetypes.add(name || scopeKey);
                    return;
                }
                if (scopeKey.startsWith('HU-')) {
                    huIds.add(scopeKey);
                    const name = huIdToName.get(scopeKey);
                    hus.add(name || scopeKey);
                    return;
                }

                // Use canonical lists when available for correct All/Archetype/HU classification
                if (archetypeNames.has(scope)) {
                    archetypes.add(scope);
                } else if (huNames.has(scope)) {
                    hus.add(scope);
                } else {
                    // Fallback heuristic when lists not yet loaded
                    if (scope.toLowerCase().includes('siloam') || scope.toLowerCase().includes('unit')) {
                        hus.add(scope);
                    } else {
                        archetypes.add(scope);
                    }
                }
            });
        });
        
        return { all: false, archetypes, hus, archetypeIds, huIds };

    }, [currentUser, scopeClassification]);

    const isAllowed = useCallback(
        (level: HierarchyLevel, action: 'view' | 'edit' | 'create' | 'delete'): boolean => {
            const userPermissionValue = userPermissions.get(level) || 0;

            switch (action) {
                case 'view':
                    return userPermissionValue >= permissionValues['View Only'];
                case 'edit':
                    return userPermissionValue >= permissionValues['View & Update'];
                case 'create':
                    return userPermissionValue >= permissionValues['View, Update & Create'];
                case 'delete':
                    return userPermissionValue >= permissionValues['View, Update, Create & Delete'];
                default:
                    return false;
            }
        },
        [userPermissions],
    );

    const getPermissionFor = useCallback(
        (level: HierarchyLevel): PermissionLevel => getPermissionLevelForHierarchy(userPermissions, level),
        [userPermissions],
    );

    const getVisibleArchetypes = useCallback(
        (allArchetypes: ArchetypeConfig[]): ArchetypeConfig[] => {
            if (userScopes.all) return allArchetypes;
            return allArchetypes.filter((arch) => userScopes.archetypes.has(arch.name));
        },
        [userScopes],
    );

    const getVisibleHUs = useCallback(
        (allHUs: HospitalUnitConfig[], selectedArchetype?: ArchetypeConfig): HospitalUnitConfig[] => {
            let filteredHUs = allHUs;

            if (selectedArchetype) {
                filteredHUs = filteredHUs.filter((hu) => hu.archetypeId === selectedArchetype.id);
            }

            if (userScopes.all) return filteredHUs;

            if (selectedArchetype && userScopes.archetypes.has(selectedArchetype.name)) {
                return filteredHUs;
            }

            return filteredHUs.filter((hu) => userScopes.hus.has(hu.name));
        },
        [userScopes],
    );

    const canAccessPage = useCallback(
        (page: Page): boolean => canAccessPageWithPermissionMap(userPermissions, page),
        [userPermissions],
    );

    const canOperateOnPage = useCallback(
        (page: Page, action: PageDataAction): boolean =>
            canPerformPageDataAction(userPermissions, page, action),
        [userPermissions],
    );

    return useMemo(
        () => ({
            isAllowed,
            canAccessPage,
            canOperateOnPage,
            getVisibleArchetypes,
            getVisibleHUs,
            getPermissionFor,
            userScopes,
        }),
        [isAllowed, canAccessPage, canOperateOnPage, getVisibleArchetypes, getVisibleHUs, getPermissionFor, userScopes],
    );
};
