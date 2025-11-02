-- Create alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
  target_audience TEXT NOT NULL CHECK (target_audience IN ('specific', 'all_owners', 'team')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Create alert_recipients table
CREATE TABLE public.alert_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(alert_id, user_id)
);

-- Enable RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_recipients ENABLE ROW LEVEL SECURITY;

-- Policies for alerts
CREATE POLICY "Team can manage alerts"
  ON public.alerts
  FOR ALL
  USING (is_team_member(auth.uid()));

-- Policies for alert_recipients
CREATE POLICY "Users can view their alert recipients"
  ON public.alert_recipients
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their alert recipients"
  ON public.alert_recipients
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Team can manage alert recipients"
  ON public.alert_recipients
  FOR ALL
  USING (is_team_member(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_alert_recipients_user_id ON public.alert_recipients(user_id);
CREATE INDEX idx_alert_recipients_alert_id ON public.alert_recipients(alert_id);
CREATE INDEX idx_alerts_active ON public.alerts(is_active) WHERE is_active = true;