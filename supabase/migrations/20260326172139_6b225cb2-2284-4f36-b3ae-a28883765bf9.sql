ALTER TABLE public.date_block_requests
ADD CONSTRAINT date_block_requests_owner_id_fkey
FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;