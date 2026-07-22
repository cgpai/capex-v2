import { UserActivityMetric, RolePerformanceMetric } from '../types';

/** Legacy monitoring reports removed — use backend analytics bundles. */
export const getUserActivityReport = async (): Promise<UserActivityMetric[]> => [];

export const getRolePerformanceReport = async (): Promise<RolePerformanceMetric[]> => [];
