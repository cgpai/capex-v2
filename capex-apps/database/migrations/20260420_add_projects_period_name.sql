-- Add explicit period FK on projects for strict period filtering
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS period_name varchar(255);

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_period_name_fkey;

ALTER TABLE public.projects
ADD CONSTRAINT projects_period_name_fkey
FOREIGN KEY (period_name)
REFERENCES public.budget_periods(period_name)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_period_name ON public.projects(period_name);

-- Backfill period_name from existing project_code tokens (best effort)
UPDATE public.projects p
SET period_name = bp.period_name
FROM public.budget_periods bp
WHERE (p.period_name IS NULL OR p.period_name = '')
  AND (
    p.project_code ILIKE ('%.' || bp.period_name || '.%')
    OR p.project_code ILIKE (bp.period_name || '.%')
  );

-- Legacy fallback: match by 2-digit year token in project_code
UPDATE public.projects p
SET period_name = bp.period_name
FROM public.budget_periods bp
WHERE (p.period_name IS NULL OR p.period_name = '')
  AND bp.start_date IS NOT NULL
  AND p.project_code ILIKE ('%.' || RIGHT(EXTRACT(YEAR FROM bp.start_date)::text, 2) || '.%');
