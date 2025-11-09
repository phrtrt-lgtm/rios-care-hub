-- Adicionar campos para QR code PIX do Mercado Pago
ALTER TABLE public.charges 
ADD COLUMN pix_qr_code TEXT,
ADD COLUMN pix_qr_code_base64 TEXT;