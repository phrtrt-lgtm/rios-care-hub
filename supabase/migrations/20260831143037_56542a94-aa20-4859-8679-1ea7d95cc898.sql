ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS curation_only boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET curation_only = true WHERE lower(email) = 'marciogilts@gmail.com';