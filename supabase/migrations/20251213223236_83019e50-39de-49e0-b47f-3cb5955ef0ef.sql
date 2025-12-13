-- Create table for message read receipts
CREATE TABLE public.message_read_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('ticket', 'charge')),
  reader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (message_id, reader_id)
);

-- Create index for faster lookups
CREATE INDEX idx_message_read_receipts_message ON public.message_read_receipts(message_id, message_type);
CREATE INDEX idx_message_read_receipts_reader ON public.message_read_receipts(reader_id);

-- Enable Row Level Security
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

-- Team can view all read receipts
CREATE POLICY "Team can view all read receipts"
ON public.message_read_receipts
FOR SELECT
USING (is_team_member(auth.uid()));

-- Team can insert read receipts
CREATE POLICY "Team can insert read receipts"
ON public.message_read_receipts
FOR INSERT
WITH CHECK (is_team_member(auth.uid()) AND auth.uid() = reader_id);

-- Owners can view read receipts for their messages
CREATE POLICY "Owners can view read receipts for their messages"
ON public.message_read_receipts
FOR SELECT
USING (
  (message_type = 'ticket' AND EXISTS (
    SELECT 1 FROM ticket_messages tm
    JOIN tickets t ON t.id = tm.ticket_id
    WHERE tm.id = message_read_receipts.message_id
    AND t.owner_id = auth.uid()
  ))
  OR
  (message_type = 'charge' AND EXISTS (
    SELECT 1 FROM charge_messages cm
    JOIN charges c ON c.id = cm.charge_id
    WHERE cm.id = message_read_receipts.message_id
    AND c.owner_id = auth.uid()
  ))
);

-- Owners can insert their own read receipts
CREATE POLICY "Owners can insert their own read receipts"
ON public.message_read_receipts
FOR INSERT
WITH CHECK (auth.uid() = reader_id);