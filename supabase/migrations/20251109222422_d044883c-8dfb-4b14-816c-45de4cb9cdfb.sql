-- Adicionar colunas para integração com Mercado Pago
ALTER TABLE public.charges 
ADD COLUMN IF NOT EXISTS payment_link TEXT,
ADD COLUMN IF NOT EXISTS mercadopago_preference_id TEXT,
ADD COLUMN IF NOT EXISTS mercadopago_payment_id TEXT;