import React, { useState, useEffect } from 'react';
import {
  Task,
  EnrichedAsset,
  Project,
  SYSTEM_TRIGGER_EVENTS,
  SystemTriggerEvent,
  FINAL_FS_APPROVAL_CONCLUSIONS,
  FSConclusion,
} from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { CurrencyInput } from '../../atoms/CurrencyInput/CurrencyInput';

type TriggerFormData = Record<string, unknown>;

interface SystemTriggerDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    triggerDataByEvent: Partial<Record<SystemTriggerEvent, TriggerFormData>>;
    remark: string;
  }) => Promise<void>;
  task: Task | null;
  asset: EnrichedAsset | null;
  project: Project | null;
  activeTriggerEvents: SystemTriggerEvent[];
}

function buildInitialDataByEvent(
  events: SystemTriggerEvent[],
  asset: EnrichedAsset | null,
  project: Project | null,
): Partial<Record<SystemTriggerEvent, TriggerFormData>> {
  const initial: Partial<Record<SystemTriggerEvent, TriggerFormData>> = {};
  for (const event of events) {
    switch (event) {
      case 'BUDGET_APPROVED':
        initial[event] = { approvedBudget: project?.approvedBudget || 0 };
        break;
      case 'PO_CREATED':
        initial[event] = {
          poNumber: asset?.poNumber || '',
          consumedBudget: asset?.consumedBudget || 0,
          poDate: asset?.poDate || new Date().toISOString().slice(0, 10),
        };
        break;
      case 'PO_GOODS_RECEIVED':
        initial[event] = { isGoodsReceived: Boolean(asset?.isGoodsReceived) };
        break;
      case 'ASSET_BUDGET_PLAN_FILLED':
        initial[event] = { budgetPlan: asset?.budgetPlan || 0 };
        break;
      case 'FS_APPROVAL': {
        const fsStatus = (project as { fsStatus?: string } | null | undefined)?.fsStatus;
        const preset = FINAL_FS_APPROVAL_CONCLUSIONS.includes(fsStatus as FSConclusion)
          ? fsStatus
          : '';
        initial[event] = {
          conclusion: preset,
          amount: project?.approvedBudget || 0,
          followUpAction: '',
          fsType: 'Capex',
        };
        break;
      }
      default:
        initial[event] = {};
        break;
    }
  }
  return initial;
}

export const SystemTriggerDataModal: React.FC<SystemTriggerDataModalProps> = ({
  isOpen,
  onClose,
  onSave,
  task,
  asset,
  project,
  activeTriggerEvents,
}) => {
  const [dataByEvent, setDataByEvent] = useState<Partial<Record<SystemTriggerEvent, TriggerFormData>>>(
    {},
  );
  const [remark, setRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDataByEvent(buildInitialDataByEvent(activeTriggerEvents, asset, project));
      setRemark('');
      setError('');
    }
  }, [isOpen, activeTriggerEvents, asset, project]);

  if (!isOpen || !task || activeTriggerEvents.length === 0) return null;

  const patchEventData = (event: SystemTriggerEvent, patch: TriggerFormData) => {
    setDataByEvent((prev) => ({
      ...prev,
      [event]: { ...(prev[event] ?? {}), ...patch },
    }));
  };

  const handleSave = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await onSave({ triggerDataByEvent: dataByEvent, remark });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save data.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderEventFields = (triggerEvent: SystemTriggerEvent) => {
    const data = dataByEvent[triggerEvent] ?? {};
    const label = SYSTEM_TRIGGER_EVENTS.find((e) => e.value === triggerEvent)?.label ?? triggerEvent;

    switch (triggerEvent) {
      case 'BUDGET_APPROVED':
        return (
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">
              Project Approved Budget
            </label>
            <CurrencyInput
              value={(data.approvedBudget as number) || 0}
              onValueChange={(val) => patchEventData(triggerEvent, { approvedBudget: val })}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
            />
            <p className="text-xs text-siloam-text-secondary mt-1">
              Current Project Plan: {formatCurrency(project?.budgetPlan || 0)}
            </p>
          </div>
        );
      case 'PO_CREATED':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">PO Number</label>
              <input
                type="text"
                value={(data.poNumber as string) || ''}
                onChange={(e) => patchEventData(triggerEvent, { poNumber: e.target.value })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
                placeholder="Masukkan nomor PO"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">
                PO Value (Consumed Budget)
              </label>
              <CurrencyInput
                value={(data.consumedBudget as number) || 0}
                onValueChange={(val) => patchEventData(triggerEvent, { consumedBudget: val })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
              />
              <p className="text-xs text-siloam-text-secondary mt-1">
                Current Asset Plan: {formatCurrency(asset?.budgetPlan || 0)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">Tgl PO</label>
              <input
                type="date"
                value={(data.poDate as string) || ''}
                onChange={(e) => patchEventData(triggerEvent, { poDate: e.target.value })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
              />
              <p className="text-xs text-siloam-text-secondary mt-1">
                Digunakan sebagai tanggal selesai task PO (PO Created, PO sent to vendor).
              </p>
            </div>
          </>
        );
      case 'PO_GOODS_RECEIVED':
        return (
          <div className="flex items-center">
            <input
              id={`gr-status-${triggerEvent}`}
              type="checkbox"
              checked={Boolean(data.isGoodsReceived)}
              onChange={(e) => patchEventData(triggerEvent, { isGoodsReceived: e.target.checked })}
              className="h-5 w-5 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
            />
            <label
              htmlFor={`gr-status-${triggerEvent}`}
              className="ml-2 text-sm font-medium text-siloam-text-primary"
            >
              Confirm Goods Received (GR) / PO Done
            </label>
          </div>
        );
      case 'ASSET_BUDGET_PLAN_FILLED':
        return (
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">
              Asset Budget Plan
            </label>
            <CurrencyInput
              value={(data.budgetPlan as number) || 0}
              onValueChange={(val) => patchEventData(triggerEvent, { budgetPlan: val })}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
            />
          </div>
        );
      case 'FS_APPROVAL':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">
                FS Conclusion
              </label>
              <select
                value={(data.conclusion as string) || ''}
                onChange={(e) => patchEventData(triggerEvent, { conclusion: e.target.value })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-white"
              >
                <option value="">— Pilih status approval —</option>
                {FINAL_FS_APPROVAL_CONCLUSIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">
                FS Amount (opsional)
              </label>
              <CurrencyInput
                value={(data.amount as number) || 0}
                onValueChange={(val) => patchEventData(triggerEvent, { amount: val })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">
                Follow-up Action (opsional)
              </label>
              <textarea
                value={(data.followUpAction as string) || ''}
                onChange={(e) => patchEventData(triggerEvent, { followUpAction: e.target.value })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
                rows={2}
                placeholder="Catatan follow-up approval..."
              />
            </div>
            <p className="text-xs text-siloam-text-secondary">
              Data FS akan dibuat/ di-update untuk project ini. Anda juga bisa mengelola detail penuh di
              screen <strong>FS Approval</strong>.
            </p>
          </>
        );
      default:
        return (
          <p className="text-sm text-siloam-text-secondary">
            Trigger &apos;{label}&apos; tidak memerlukan input data tambahan.
          </p>
        );
    }
  };

  const fsConclusion = String((dataByEvent.FS_APPROVAL?.conclusion as string) ?? '').trim();
  const poNumber = String((dataByEvent.PO_CREATED?.poNumber as string) ?? '').trim();
  const poValue = Number(dataByEvent.PO_CREATED?.consumedBudget ?? 0);
  const grConfirmed = Boolean(dataByEvent.PO_GOODS_RECEIVED?.isGoodsReceived);

  const isSaveDisabled =
    isSubmitting ||
    !remark.trim() ||
    (activeTriggerEvents.includes('PO_CREATED') && !poNumber && poValue <= 0) ||
    (activeTriggerEvents.includes('PO_GOODS_RECEIVED') && !grConfirmed) ||
    (activeTriggerEvents.includes('FS_APPROVAL') &&
      !FINAL_FS_APPROVAL_CONCLUSIONS.includes(fsConclusion as FSConclusion));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[52]">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold">Complete Task: {task.name}</h3>
        <p className="text-sm text-siloam-text-secondary mt-1 mb-4">
          Task ini terhubung ke system trigger. Lengkapi data yang diperlukan untuk melanjutkan.
        </p>
        <div className="space-y-4">
          {activeTriggerEvents.map((triggerEvent) => {
            const label =
              SYSTEM_TRIGGER_EVENTS.find((e) => e.value === triggerEvent)?.label ?? triggerEvent;
            return (
              <div
                key={triggerEvent}
                className="rounded-xl border border-siloam-border p-3 bg-siloam-bg space-y-3"
              >
                <p className="text-sm font-semibold text-siloam-text-primary">{label}</p>
                {renderEventFields(triggerEvent)}
              </div>
            );
          })}
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">
              Completion Remark
            </label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2"
              rows={3}
              placeholder="Add a remark for the log book..."
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400"
          >
            {isSubmitting ? 'Saving...' : 'Save & Complete'}
          </button>
        </div>
      </div>
    </div>
  );
};
