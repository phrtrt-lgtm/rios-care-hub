-- Tabela principal de comissões da Booking.com
CREATE TABLE public.booking_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  guest_name TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  reservation_amount_cents INTEGER NOT NULL DEFAULT 0,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  cleaning_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_due_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent',
  due_date DATE,
  paid_at TIMESTAMP WITH TIME ZONE,
  debited_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  mercadopago_preference_id TEXT,
  mercadopago_payment_id TEXT,
  payment_link_url TEXT,
  pix_qr_code TEXT,
  pix_qr_code_base64 TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TRIGGER update_booking_commissions_updated_at
  BEFORE UPDATE ON public.booking_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.calculate_booking_commission_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.commission_cents := ROUND((NEW.reservation_amount_cents * NEW.commission_percent / 100))::INTEGER;
  NEW.total_due_cents := NEW.commission_cents + NEW.cleaning_fee_cents;
  RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_booking_commission_before_save
  BEFORE INSERT OR UPDATE ON public.booking_commissions
  FOR EACH ROW EXECUTE FUNCTION public.calculate_booking_commission_total();

CREATE TABLE public.booking_commission_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  commission_id UUID NOT NULL REFERENCES public.booking_commissions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.booking_commission_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  commission_id UUID NOT NULL REFERENCES public.booking_commissions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_commission_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_commission_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can manage booking commissions"
  ON public.booking_commissions FOR ALL
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view their booking commissions"
  ON public.booking_commissions FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can update their booking commissions"
  ON public.booking_commissions FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Team can manage booking commission messages"
  ON public.booking_commission_messages FOR ALL
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view their commission messages"
  ON public.booking_commission_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.booking_commissions bc
    WHERE bc.id = booking_commission_messages.commission_id
    AND bc.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can insert commission messages"
  ON public.booking_commission_messages FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.booking_commissions bc
      WHERE bc.id = booking_commission_messages.commission_id
      AND bc.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team can manage booking commission attachments"
  ON public.booking_commission_attachments FOR ALL
  USING (is_team_member(auth.uid()));

CREATE POLICY "Owners can view their commission attachments"
  ON public.booking_commission_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.booking_commissions bc
    WHERE bc.id = booking_commission_attachments.commission_id
    AND bc.owner_id = auth.uid()
  ));

CREATE INDEX idx_booking_commissions_owner_id ON public.booking_commissions(owner_id);
CREATE INDEX idx_booking_commissions_property_id ON public.booking_commissions(property_id);
CREATE INDEX idx_booking_commissions_status ON public.booking_commissions(status);
CREATE INDEX idx_booking_commissions_check_in ON public.booking_commissions(check_in);
CREATE INDEX idx_booking_commission_messages_commission_id ON public.booking_commission_messages(commission_id);
CREATE INDEX idx_booking_commission_attachments_commission_id ON public.booking_commission_attachments(commission_id);