-- Alterar o valor padrão do payment_score para 50
ALTER TABLE public.profiles 
ALTER COLUMN payment_score SET DEFAULT 50;