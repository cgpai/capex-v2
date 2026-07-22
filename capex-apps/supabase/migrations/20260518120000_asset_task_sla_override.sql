-- Per-asset SLA override (does not change workflow_steps / tasks default SLA).
ALTER TABLE asset_task_statuses
  ADD COLUMN IF NOT EXISTS sla_to_complete_override integer;

COMMENT ON COLUMN asset_task_statuses.sla_to_complete_override IS
  'Optional SLA days for this asset+task; overrides workflow step default without changing global config.';
