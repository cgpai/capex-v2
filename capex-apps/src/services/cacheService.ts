/**
 * Cache Service for frequently accessed data
 * Reduces database queries and improves performance
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

class CacheService {
    private cache = new Map<string, CacheEntry<any>>();
    private defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL

    /**
     * Get data from cache if available and not expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        const now = Date.now();
        if (now > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Set data in cache with TTL
     */
    set<T>(key: string, data: T, ttl?: number): void {
        const now = Date.now();
        const expiresAt = now + (ttl || this.defaultTTL);
        
        this.cache.set(key, {
            data,
            timestamp: now,
            expiresAt,
        });
    }

    /**
     * Check if key exists and is valid
     */
    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        const now = Date.now();
        if (now > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Invalidate cache for a key
     */
    invalidate(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Invalidate all cache entries matching a pattern
     */
    invalidatePattern(pattern: string | RegExp): void {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const now = Date.now();
        let valid = 0;
        let expired = 0;

        for (const entry of this.cache.values()) {
            if (now > entry.expiresAt) {
                expired++;
            } else {
                valid++;
            }
        }

        return {
            total: this.cache.size,
            valid,
            expired,
        };
    }
}

export const cacheService = new CacheService();

/**
 * Cache keys for different data types
 */
export const CacheKeys = {
    // Config data (long TTL - 30 minutes)
    ROLES: 'config:roles',
    USERS: 'config:users',
    ARCHETYPES: 'config:archetypes',
    HOSPITAL_UNITS: 'config:hospital_units',
    REGIONALS: 'config:regionals',
    TASKS: 'config:tasks',
    WORKFLOWS: 'config:workflows',
    ASSET_TYPES: 'config:asset_types',
    ASSET_TYPE_GROUPS: 'config:asset_type_groups',
    BUDGET_CATEGORIES: 'config:budget_categories',
    PROJECT_PRIORITIES: 'config:project_priorities',
    MASTER_CATALOGUE: 'config:master_catalogue',
    ROOMS: 'config:rooms',
    VENDORS: 'config:vendors',
    ASSET_TAGS: 'config:asset_tags',

    // Period-specific data (shorter TTL - 2 minutes)
    PERIOD: (periodName: string) => `period:${periodName}`,
    PERIOD_PROJECTS: (periodName: string) => `period:${periodName}:projects`,
    PERIOD_ASSETS: (periodName: string) => `period:${periodName}:assets`,
    
    // User-specific data (short TTL - 1 minute)
    USER_TASKS: (userId: number) => `user:${userId}:tasks`,
    
    // Task data (short TTL - 1 minute)
    TASK_STATUSES: 'tasks:statuses',
    TASK_LOGS: 'tasks:logs',
};

/**
 * Helper to get cached or fetch data
 */
export async function getCachedOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
): Promise<T> {
    const cached = cacheService.get<T>(key);
    if (cached !== null) {
        return cached;
    }

    const data = await fetchFn();
    cacheService.set(key, data, ttl);
    return data;
}

/**
 * Invalidate all period-related cache
 */
export function invalidatePeriodCache(periodName: string): void {
    cacheService.invalidatePattern(`^period:${periodName}`);
}

/**
 * Invalidate all config cache
 */
export function invalidateConfigCache(): void {
    cacheService.invalidatePattern('^config:');
}

