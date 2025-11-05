-- Add owner_phone column to properties table
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS owner_phone text;

-- Add comment
COMMENT ON COLUMN public.properties.owner_phone IS 'Telefone do proprietário para contato da equipe (gerenciado pela equipe, não pelo proprietário)';