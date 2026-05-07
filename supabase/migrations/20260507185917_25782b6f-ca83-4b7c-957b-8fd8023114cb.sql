
CREATE TABLE public.curadoria_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_curadoria_messages_owner ON public.curadoria_messages(owner_id, created_at);

ALTER TABLE public.curadoria_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their curadoria messages"
  ON public.curadoria_messages FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Team can view all curadoria messages"
  ON public.curadoria_messages FOR SELECT
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Owners can post in their curadoria thread"
  ON public.curadoria_messages FOR INSERT
  WITH CHECK (auth.uid() = author_id AND auth.uid() = owner_id);

CREATE POLICY "Team can post in any curadoria thread"
  ON public.curadoria_messages FOR INSERT
  WITH CHECK (auth.uid() = author_id AND public.is_team_member(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.curadoria_messages;
ALTER TABLE public.curadoria_messages REPLICA IDENTITY FULL;
