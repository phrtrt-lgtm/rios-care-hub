-- Add attachments support to alerts table
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS has_attachments boolean DEFAULT false;

-- Create alert_attachments table
CREATE TABLE IF NOT EXISTS public.alert_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on alert_attachments
ALTER TABLE public.alert_attachments ENABLE ROW LEVEL SECURITY;

-- Create policies for alert_attachments
CREATE POLICY "Team can manage alert attachments"
ON public.alert_attachments
FOR ALL
TO authenticated
USING (is_team_member(auth.uid()));

CREATE POLICY "Users can view attachments from their alerts"
ON public.alert_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM alert_recipients ar
    WHERE ar.alert_id = alert_attachments.alert_id
    AND ar.user_id = auth.uid()
  )
);