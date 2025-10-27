-- Create charge_messages table for chat functionality
CREATE TABLE public.charge_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_id UUID NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.charge_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Charge participants can create messages
CREATE POLICY "Charge participants can create messages"
ON public.charge_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = author_id AND
  EXISTS (
    SELECT 1 FROM charges
    WHERE charges.id = charge_messages.charge_id
    AND (charges.owner_id = auth.uid() OR is_team_member(auth.uid()))
  )
);

-- Policy: Users can view messages from their charges (non-internal or team members)
CREATE POLICY "Users can view messages from their charges"
ON public.charge_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM charges
    WHERE charges.id = charge_messages.charge_id
    AND (charges.owner_id = auth.uid() OR is_team_member(auth.uid()))
  )
  AND (NOT is_internal OR is_team_member(auth.uid()))
);

-- Enable realtime for charge_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.charge_messages;

-- Add index for better performance
CREATE INDEX idx_charge_messages_charge_id ON public.charge_messages(charge_id);
CREATE INDEX idx_charge_messages_created_at ON public.charge_messages(created_at);