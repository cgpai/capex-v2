'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { PageTourPlacement, PageTourStep } from './types';

const TOUR_Z = 10070;
const PAD = 8;
const TOOLTIP_GAP = 12;

type Rect = { top: number; left: number; width: number; height: number };

function resolveTarget(target?: string): Element | null {
  if (!target || typeof document === 'undefined') return null;
  return document.querySelector(`[data-tour="${target}"]`);
}

function measureRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 && r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function resolveActiveSteps(steps: PageTourStep[]): PageTourStep[] {
  return steps.filter((step) => {
    if (!step.target) return true;
    return isTargetVisible(step.target);
  });
}

function isTargetVisible(target: string): boolean {
  const el = resolveTarget(target);
  if (!el) return false;
  return measureRect(el) !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type TooltipStyle = {
  top: number;
  left: number;
  maxWidth: number;
};

function computeTooltipStyle(
  rect: Rect | null,
  placement: PageTourPlacement,
  tooltipSize: { width: number; height: number },
): TooltipStyle {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const maxWidth = Math.min(360, vw - 24);

  if (!rect || placement === 'center') {
    return {
      top: vh / 2 - tooltipSize.height / 2,
      left: vw / 2 - maxWidth / 2,
      maxWidth,
    };
  }

  let top = rect.top + rect.height / 2 - tooltipSize.height / 2;
  let left = rect.left + rect.width / 2 - maxWidth / 2;

  switch (placement) {
    case 'bottom':
      top = rect.top + rect.height + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - maxWidth / 2;
      break;
    case 'top':
      top = rect.top - tooltipSize.height - TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - maxWidth / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipSize.height / 2;
      left = rect.left - maxWidth - TOOLTIP_GAP;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipSize.height / 2;
      left = rect.left + rect.width + TOOLTIP_GAP;
      break;
    default:
      break;
  }

  return {
    top: clamp(top, 12, vh - tooltipSize.height - 12),
    left: clamp(left, 12, vw - maxWidth - 12),
    maxWidth,
  };
}

export type PageTourOverlayProps = {
  steps: PageTourStep[];
  isOpen: boolean;
  onClose: (completed: boolean) => void;
};

export const PageTourOverlay: React.FC<PageTourOverlayProps> = ({
  steps,
  isOpen,
  onClose,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<TooltipStyle>({
    top: 0,
    left: 0,
    maxWidth: 360,
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const activeSteps = useMemo(() => resolveActiveSteps(steps), [steps]);

  const currentStep = activeSteps[stepIndex] ?? null;
  const isLastStep = stepIndex >= activeSteps.length - 1;
  const progressLabel =
    activeSteps.length > 0 ? `${stepIndex + 1} / ${activeSteps.length}` : '';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStepIndex(0);
      setTargetRect(null);
    }
  }, [isOpen]);

  const updateLayout = useCallback(() => {
    if (!currentStep) return;
    const el = currentStep.target ? resolveTarget(currentStep.target) : null;
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    const rect = measureRect(el);
    setTargetRect(rect);
    const placement = currentStep.placement ?? (rect ? 'bottom' : 'center');
    const tooltipEl = tooltipRef.current;
    const tooltipSize = {
      width: tooltipEl?.offsetWidth ?? 320,
      height: tooltipEl?.offsetHeight ?? 180,
    };
    setTooltipStyle(computeTooltipStyle(rect, placement, tooltipSize));
  }, [currentStep]);

  useLayoutEffect(() => {
    if (!isOpen || !currentStep) return;
    updateLayout();
    const raf = requestAnimationFrame(updateLayout);
    return () => cancelAnimationFrame(raf);
  }, [isOpen, currentStep, stepIndex, updateLayout]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => updateLayout();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [isOpen, updateLayout]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const goNext = useCallback(() => {
    if (isLastStep) {
      onClose(true);
      return;
    }
    setStepIndex((i) => i + 1);
  }, [isLastStep, onClose]);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!mounted || !isOpen || !currentStep || activeSteps.length === 0) {
    return null;
  }

  const highlightStyle: React.CSSProperties | undefined = targetRect
    ? {
        top: targetRect.top - PAD,
        left: targetRect.left - PAD,
        width: targetRect.width + PAD * 2,
        height: targetRect.height + PAD * 2,
      }
    : undefined;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: TOUR_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-tour-title"
      aria-describedby="page-tour-desc"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 border-0 cursor-default"
        aria-label="Tutup panduan"
        onClick={() => onClose(false)}
      />

      {highlightStyle ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-siloam-blue ring-offset-2 ring-offset-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
          style={highlightStyle}
          aria-hidden
        />
      ) : null}

      <div
        ref={tooltipRef}
        className="fixed bg-siloam-surface border border-siloam-border rounded-xl shadow-xl p-5 animate-fade-in"
        style={{
          top: tooltipStyle.top,
          left: tooltipStyle.left,
          maxWidth: tooltipStyle.maxWidth,
          zIndex: TOUR_Z + 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-medium text-siloam-text-secondary">{progressLabel}</p>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="text-xs text-siloam-text-secondary hover:text-siloam-text-primary"
          >
            Lewati
          </button>
        </div>
        <h3 id="page-tour-title" className="text-lg font-bold text-siloam-text-primary mb-2">
          {currentStep.title}
        </h3>
        <p id="page-tour-desc" className="text-sm text-siloam-text-secondary leading-relaxed">
          {currentStep.description}
        </p>
        <div className="flex items-center justify-between gap-2 mt-5">
          <button
            type="button"
            onClick={goPrev}
            disabled={stepIndex === 0}
            className="px-3 py-1.5 text-sm rounded-lg border border-siloam-border hover:bg-siloam-bg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Kembali
          </button>
          <button
            type="button"
            onClick={goNext}
            className="px-4 py-1.5 text-sm rounded-lg bg-siloam-blue text-white hover:bg-siloam-blue/90 font-medium"
          >
            {isLastStep ? 'Selesai' : 'Lanjut'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

PageTourOverlay.displayName = 'PageTourOverlay';
