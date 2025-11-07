-- Create proposals table
CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'BRL',
  deadline DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'approved', 'rejected', 'expired')),
  property_id UUID REFERENCES public.properties(id),
  required_approvals INTEGER,
  category TEXT,
  has_attachments BOOLEAN DEFAULT false
);

-- Create proposal_responses table
CREATE TABLE public.proposal_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  approved BOOLEAN NOT NULL,
  note TEXT,
  attachment_path TEXT,
  responded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, owner_id)
);

-- Create proposal_attachments table
CREATE TABLE public.proposal_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for proposals
CREATE POLICY "Team can create proposals"
  ON public.proposals FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member(auth.uid()));

CREATE POLICY "Team can view all proposals"
  ON public.proposals FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid()));

CREATE POLICY "Team can update proposals"
  ON public.proposals FOR UPDATE
  TO authenticated
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view proposals they're invited to"
  ON public.proposals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.proposal_responses pr
      WHERE pr.proposal_id = proposals.id AND pr.owner_id = auth.uid()
    )
  );

-- RLS Policies for proposal_responses
CREATE POLICY "Team can view all responses"
  ON public.proposal_responses FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view their own responses"
  ON public.proposal_responses FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can create their responses"
  ON public.proposal_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own responses"
  ON public.proposal_responses FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

-- RLS Policies for proposal_attachments
CREATE POLICY "Team can manage proposal attachments"
  ON public.proposal_attachments FOR ALL
  TO authenticated
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view attachments from their proposals"
  ON public.proposal_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.proposal_responses pr
      WHERE pr.proposal_id = proposal_attachments.proposal_id AND pr.owner_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();