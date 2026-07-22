import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_DIRECTORY_COLUMNS } from '../shared/response-sanitize.util';
import { fetchAllRecords, normId, normRoleId, toCamelCase } from './supabase-helpers';

const ROLE_LIST_COLUMNS = 'id,role_name,name';
const ROLE_PERMISSION_COLUMNS = 'role_id,hierarchy,permission';
const USER_ASSIGNMENT_SELECT = 'id,user_id,role_id,roles(role_name,name)';
const ASSIGNMENT_SCOPE_COLUMNS = 'user_assignment_id,scope_type,scope_id';

export async function getAllWorkflowSets(client: SupabaseClient): Promise<any[]> {
  const workflows = await fetchAllRecords(client, 'workflow_sets', '*');
  if (!workflows?.length) return [];
  const [steps, stepRoles, stepTriggers] = await Promise.all([
    fetchAllRecords(client, 'workflow_steps', '*'),
    fetchAllRecords(client, 'workflow_step_roles', '*'),
    fetchAllRecords(client, 'workflow_step_triggers', '*'),
  ]);
  return workflows.map((workflow: any) => {
    const workflowSteps = steps
      ?.filter((s: any) => s.workflow_set_id === workflow.id)
      .map((step: any) => {
        const roles =
          stepRoles
            ?.filter((sr: any) => sr.workflow_step_id === step.id)
            .map((sr: any) => normRoleId(sr.role_id))
            .filter((id: number | null): id is number => id != null) || [];

        const triggers =
          stepTriggers
            ?.filter((st: any) => st.workflow_step_id === step.id)
            .map((st: any) => normId(st.triggering_task_id)) || [];

        return {
          order: step.step_order,
          taskId: normId(step.task_id),
          roleIds: roles,
          slaToComplete: step.sla_to_complete,
          triggeringTaskIds: triggers,
          taskScore: step.task_score,
          milestoneScore: step.milestone_score,
        };
      })
      .sort((a: any, b: any) => a.order - b.order) || [];

    return {
      ...toCamelCase(workflow),
      steps: workflowSteps,
    };
  });
}

export async function getAllRoles(client: SupabaseClient): Promise<any[]> {
  const roles = await fetchAllRecords(client, 'roles', ROLE_LIST_COLUMNS);
  if (!roles?.length) return [];
  const permissions = await fetchAllRecords(client, 'role_permissions', ROLE_PERMISSION_COLUMNS);
  return roles.map((role: any) => {
    const rolePermissions =
      permissions
        ?.filter((p: any) => p.role_id === role.id)
        .map((p: any) => ({
          hierarchy: p.hierarchy,
          permission: p.permission,
        })) || [];

    return {
      ...toCamelCase(role),
      permissions: rolePermissions,
    };
  });
}

export async function getAllUsers(client: SupabaseClient): Promise<any[]> {
  const users = await fetchAllRecords(client, 'users', USER_DIRECTORY_COLUMNS);
  if (!users?.length) return [];
  const [assignments, scopes] = await Promise.all([
    fetchAllRecords(client, 'user_assignments', USER_ASSIGNMENT_SELECT),
    fetchAllRecords(client, 'user_assignment_scopes', ASSIGNMENT_SCOPE_COLUMNS),
  ]);

  return users.map((user: any) => {
    const userAssignments: any[] = [];
    const userIdNum = Number(user.id);
    if (assignments) {
      assignments
        .filter((ua: any) => Number(ua.user_id) === userIdNum)
        .forEach((ua: any) => {
          const aid = Number(ua.id);
          const roleRef = ua.roles;
          const roleObj = Array.isArray(roleRef) ? roleRef[0] : roleRef;
          const roleName = String(roleObj?.role_name ?? roleObj?.name ?? '').trim();
          const assignmentScopes =
            scopes
              ?.filter((s: any) => Number(s.user_assignment_id) === aid)
              .map((s: any) => {
                const scopeType = String(s.scope_type ?? '').trim();
                if (scopeType === 'All') return 'All';
                const scopeId = String(s.scope_id ?? '').trim();
                return scopeId;
              })
              .filter((x: unknown): x is string => x != null && String(x) !== '') || [];

          userAssignments.push({
            roleName,
            assignedScopes: Array.from(new Set(assignmentScopes)),
          });
        });
    }

    return {
      ...toCamelCase(user),
      assignments: userAssignments,
    };
  });
}

/** Load one user with assignments — avoids full-table getAllUsers() after save. */
export async function getUserById(client: SupabaseClient, userId: number): Promise<any | null> {
  const { data: user, error } = await client
    .from('users')
    .select(USER_DIRECTORY_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!user) return null;

  const { data: assignments } = await client
    .from('user_assignments')
    .select(USER_ASSIGNMENT_SELECT)
    .eq('user_id', userId);

  const assignmentRows = assignments ?? [];
  const assignmentIds = assignmentRows.map((ua: any) => Number(ua.id)).filter(Number.isFinite);
  let scopes: any[] = [];
  if (assignmentIds.length) {
    const { data: scopeRows } = await client
      .from('user_assignment_scopes')
      .select(ASSIGNMENT_SCOPE_COLUMNS)
      .in('user_assignment_id', assignmentIds);
    scopes = scopeRows ?? [];
  }

  const userAssignments: any[] = [];
  for (const ua of assignmentRows) {
    const aid = Number(ua.id);
    const roleRef = ua.roles;
    const roleObj = Array.isArray(roleRef) ? roleRef[0] : roleRef;
    const roleName = String(roleObj?.role_name ?? roleObj?.name ?? '').trim();
    const assignmentScopes =
      scopes
        ?.filter((s: any) => Number(s.user_assignment_id) === aid)
        .map((s: any) => {
          const scopeType = String(s.scope_type ?? '').trim();
          if (scopeType === 'All') return 'All';
          return String(s.scope_id ?? '').trim();
        })
        .filter((x: unknown): x is string => x != null && String(x) !== '') ?? [];

    userAssignments.push({
      roleName,
      assignedScopes: Array.from(new Set(assignmentScopes)),
    });
  }

  return {
    ...toCamelCase(user),
    assignments: userAssignments,
  };
}

export async function getAllTasks(client: SupabaseClient): Promise<any[]> {
  const allTasks = await fetchAllRecords(client, 'tasks', '*');
  return (allTasks || []).map((row: any) => {
    const task = toCamelCase(row) as Record<string, any>;
    const legacy = String(task.triggerEvent ?? '').trim();
    const fromLegacy = legacy
      ? legacy
          .split(/[|,]/)
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    const fromArray = Array.isArray(task.triggerEvents)
      ? task.triggerEvents.map((e: unknown) => String(e ?? '').trim()).filter(Boolean)
      : [];
    const events = [...new Set(fromArray.length > 0 ? fromArray : fromLegacy)];
    return {
      ...task,
      triggerEvents: events.length > 0 ? events : undefined,
      triggerEvent: events[0],
    };
  });
}

export async function getAllProjectPriorities(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'project_priority_configs', '*');
  return data ? data.map(toCamelCase) : [];
}

export async function getAllArchetypesConfig(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'archetypes_config', '*');
  return data ? data.map(toCamelCase) : [];
}

export async function getAllHospitalUnitsConfig(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'hospital_units_config', '*');
  return data ? data.map(toCamelCase) : [];
}

export async function fetchProjectsByIds(client: SupabaseClient, ids: string[]): Promise<any[]> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: any[] = [];
  const size = 150;
  for (let i = 0; i < unique.length; i += size) {
    const slice = unique.slice(i, i + size);
    const { data, error } = await client.from('projects').select('*').in('id', slice);
    if (error) throw new Error(error.message);
    if (data) out.push(...data);
  }
  return out.map(toCamelCase);
}
