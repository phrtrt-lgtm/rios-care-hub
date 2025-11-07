-- Adicionar novos tipos de ticket ao enum
ALTER TYPE public.ticket_type ADD VALUE IF NOT EXISTS 'informacao';
ALTER TYPE public.ticket_type ADD VALUE IF NOT EXISTS 'conversar_hospedes';
ALTER TYPE public.ticket_type ADD VALUE IF NOT EXISTS 'melhorias_compras';