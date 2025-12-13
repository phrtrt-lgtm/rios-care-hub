-- Create team chat messages table
CREATE TABLE public.team_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_chat_messages ENABLE ROW LEVEL SECURITY;

-- Team members can view all team chat messages
CREATE POLICY "Team members can view team chat messages"
ON public.team_chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'agent', 'maintenance')
  )
);

-- Team members can insert their own messages
CREATE POLICY "Team members can insert team chat messages"
ON public.team_chat_messages
FOR INSERT
WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'agent', 'maintenance')
  )
);

-- Enable realtime for team chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_chat_messages;

-- Create index for faster queries
CREATE INDEX idx_team_chat_messages_created_at ON public.team_chat_messages(created_at DESC);