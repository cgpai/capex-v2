-- PO Update columns missing from prod schema (code added before migration)
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS cpr_id text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS po_date date;

COMMENT ON COLUMN public.assets.cpr_id IS 'Capex Purchase Request identifier (PO Update screen)';
COMMENT ON COLUMN public.assets.po_date IS 'Purchase order date';
