ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_stage text;

COMMENT ON COLUMN public.profiles.onboarding_stage IS 'Etapa do onboarding: welcome | meeting_scheduled | curation | active';