import type { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestException } from '@nestjs/common';
import { normId, normRoleId } from '../project-list/supabase-helpers';

type WorkflowStepPayload = {
  order?: number;
  taskId?: string;
  roleIds?: number[];
  slaToComplete?: number | null;
  triggeringTaskIds?: string[];
  taskScore?: number;
  milestoneScore?: number | null;
};

export type WorkflowSetPayload = {
  id?: string;
  name?: string;
  steps?: WorkflowStepPayload[];
};

export async function persistWorkflowSet(
  client: SupabaseClient,
  workflowSet: WorkflowSetPayload,
): Promise<WorkflowSetPayload> {
  const id = String(workflowSet.id ?? '').trim();
  const name = String(workflowSet.name ?? '').trim();
  if (!id) throw new BadRequestException('workflowSet.id is required');
  if (!name) throw new BadRequestException('workflowSet.name is required');

  const { data: savedWorkflow, error: workflowError } = await client
    .from('workflow_sets')
    .upsert({ id, name })
    .select()
    .single();
  if (workflowError) throw new BadRequestException(`saveWorkflowSet: ${workflowError.message}`);

  const savedId = String(savedWorkflow?.id ?? id);
  const steps = Array.isArray(workflowSet.steps) ? workflowSet.steps : [];

  const { data: existingSteps } = await client
    .from('workflow_steps')
    .select('id')
    .eq('workflow_set_id', savedId);

  if (existingSteps?.length) {
    const stepIds = existingSteps.map((s) => s.id);
    await client.from('workflow_step_triggers').delete().in('workflow_step_id', stepIds);
    await client.from('workflow_step_roles').delete().in('workflow_step_id', stepIds);
    await client.from('workflow_steps').delete().eq('workflow_set_id', savedId);
  }

  for (const step of steps) {
    const { data: newStep, error: stepErr } = await client
      .from('workflow_steps')
      .insert({
        workflow_set_id: savedId,
        step_order: Number(step.order ?? 0),
        task_id: normId(step.taskId),
        sla_to_complete: step.slaToComplete ?? null,
        task_score: step.taskScore ?? 0,
        milestone_score: step.milestoneScore ?? null,
      })
      .select()
      .single();
    if (stepErr) throw new BadRequestException(`saveWorkflowSet step: ${stepErr.message}`);

    if (newStep) {
      const roleIds = Array.isArray(step.roleIds) ? step.roleIds : [];
      if (roleIds.length) {
        const roles = roleIds
          .map((roleId) => normRoleId(roleId))
          .filter((rid): rid is number => rid != null)
          .map((role_id) => ({ workflow_step_id: newStep.id, role_id }));
        if (roles.length) {
          const { error } = await client.from('workflow_step_roles').insert(roles);
          if (error) throw new BadRequestException(`saveWorkflowSet roles: ${error.message}`);
        }
      }

      const triggerIds = Array.isArray(step.triggeringTaskIds) ? step.triggeringTaskIds : [];
      if (triggerIds.length) {
        const triggers = triggerIds.map((taskId) => ({
          workflow_step_id: newStep.id,
          triggering_task_id: normId(taskId),
        }));
        const { error } = await client.from('workflow_step_triggers').insert(triggers);
        if (error) throw new BadRequestException(`saveWorkflowSet triggers: ${error.message}`);
      }
    }
  }

  return workflowSet;
}

export async function deleteWorkflowSetById(client: SupabaseClient, id: string): Promise<void> {
  const wfId = String(id ?? '').trim();
  if (!wfId) throw new BadRequestException('Invalid id');

  const { data: existingSteps } = await client
    .from('workflow_steps')
    .select('id')
    .eq('workflow_set_id', wfId);

  if (existingSteps?.length) {
    const stepIds = existingSteps.map((s) => s.id);
    await client.from('workflow_step_triggers').delete().in('workflow_step_id', stepIds);
    await client.from('workflow_step_roles').delete().in('workflow_step_id', stepIds);
    await client.from('workflow_steps').delete().eq('workflow_set_id', wfId);
  }

  const { error } = await client.from('workflow_sets').delete().eq('id', wfId);
  if (error) throw new BadRequestException(error.message);
}
