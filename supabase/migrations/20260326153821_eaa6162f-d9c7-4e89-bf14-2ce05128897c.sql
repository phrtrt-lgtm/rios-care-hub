
CREATE TABLE public.date_block_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('maintenance', 'family_visit')),
  notes TEXT,
  cleaning_fee_proof_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'rejected')),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.date_block_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can create date block requests"
  ON public.date_block_requests FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can view their date block requests"
  ON public.date_block_requests FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Team can manage date block requests"
  ON public.date_block_requests FOR ALL
  USING (is_team_member(auth.uid()));

CREATE TRIGGER update_date_block_requests_updated_at
  BEFORE UPDATE ON public.date_block_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
