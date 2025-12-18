-- Drop and recreate foreign keys with ON DELETE SET NULL for created_by columns
-- This allows user deletion without losing the historical data

-- charge_attachments
ALTER TABLE public.charge_attachments 
DROP CONSTRAINT IF EXISTS charge_attachments_created_by_fkey;

ALTER TABLE public.charge_attachments 
ADD CONSTRAINT charge_attachments_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make created_by nullable if not already
ALTER TABLE public.charge_attachments 
ALTER COLUMN created_by DROP NOT NULL;

-- ai_prompt_versions
ALTER TABLE public.ai_prompt_versions 
DROP CONSTRAINT IF EXISTS ai_prompt_versions_created_by_fkey;

ALTER TABLE public.ai_prompt_versions 
ADD CONSTRAINT ai_prompt_versions_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ai_usage_logs
ALTER TABLE public.ai_usage_logs 
DROP CONSTRAINT IF EXISTS ai_usage_logs_created_by_fkey;

ALTER TABLE public.ai_usage_logs 
ADD CONSTRAINT ai_usage_logs_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- alerts
ALTER TABLE public.alerts 
DROP CONSTRAINT IF EXISTS alerts_created_by_fkey;

ALTER TABLE public.alerts 
ADD CONSTRAINT alerts_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.alerts 
ALTER COLUMN created_by DROP NOT NULL;

-- maintenance_payment_attachments
ALTER TABLE public.maintenance_payment_attachments 
DROP CONSTRAINT IF EXISTS maintenance_payment_attachments_created_by_fkey;

ALTER TABLE public.maintenance_payment_attachments 
ADD CONSTRAINT maintenance_payment_attachments_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_payment_attachments 
ALTER COLUMN created_by DROP NOT NULL;

-- proposal_attachments
ALTER TABLE public.proposal_attachments 
DROP CONSTRAINT IF EXISTS proposal_attachments_created_by_fkey;

ALTER TABLE public.proposal_attachments 
ADD CONSTRAINT proposal_attachments_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.proposal_attachments 
ALTER COLUMN created_by DROP NOT NULL;

-- proposals
ALTER TABLE public.proposals 
DROP CONSTRAINT IF EXISTS proposals_created_by_fkey;

ALTER TABLE public.proposals 
ADD CONSTRAINT proposals_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.proposals 
ALTER COLUMN created_by DROP NOT NULL;