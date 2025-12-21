-- Add archived_at column to tickets table for archiving maintenance items
ALTER TABLE public.tickets 
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add archived_at column to charges table for archiving charges
ALTER TABLE public.charges 
ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for faster filtering on archived status
CREATE INDEX idx_tickets_archived_at ON public.tickets(archived_at);
CREATE INDEX idx_charges_archived_at ON public.charges(archived_at);