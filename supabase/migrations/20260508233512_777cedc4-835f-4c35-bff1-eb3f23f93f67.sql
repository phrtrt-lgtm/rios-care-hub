
ALTER TABLE public.owner_curations
  ADD COLUMN IF NOT EXISTS total_amount_cents integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS mercadopago_payment_id text,
  ADD COLUMN IF NOT EXISTS pix_qr_code text,
  ADD COLUMN IF NOT EXISTS pix_qr_code_base64 text;
