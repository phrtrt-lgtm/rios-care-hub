-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('owner', 'agent', 'admin', 'pending_owner');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  role app_role NOT NULL DEFAULT 'pending_owner',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create properties table
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ticket types and statuses as enums
CREATE TYPE public.ticket_type AS ENUM ('duvida', 'manutencao', 'cobranca', 'bloqueio_data', 'financeiro', 'outros');
CREATE TYPE public.ticket_status AS ENUM ('novo', 'em_analise', 'aguardando_info', 'em_execucao', 'concluido', 'cancelado');
CREATE TYPE public.ticket_priority AS ENUM ('normal', 'urgente');

-- Create tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  ticket_type ticket_type NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status ticket_status NOT NULL DEFAULT 'novo',
  priority ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sla_due_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  blocked_dates_start DATE,
  blocked_dates_end DATE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ticket_messages table
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ticket_attachments table
CREATE TABLE public.ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.ticket_messages(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create charges table
CREATE TABLE public.charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
  payment_link_url TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND role = _role
  )
$$;

-- Create function to check if user is team member (agent or admin)
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id AND role IN ('agent', 'admin')
  )
$$;

-- Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Team can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Policies for properties
CREATE POLICY "Owners can view their properties"
  ON public.properties FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Team can view all properties"
  ON public.properties FOR SELECT
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Owners can insert their properties"
  ON public.properties FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their properties"
  ON public.properties FOR UPDATE
  USING (auth.uid() = owner_id);

-- Policies for tickets
CREATE POLICY "Owners can view their tickets"
  ON public.tickets FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Team can view all tickets"
  ON public.tickets FOR SELECT
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Owners can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND auth.uid() = created_by);

CREATE POLICY "Team can update tickets"
  ON public.tickets FOR UPDATE
  USING (public.is_team_member(auth.uid()));

-- Policies for ticket_messages
CREATE POLICY "Users can view messages from their tickets"
  ON public.ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets
      WHERE tickets.id = ticket_messages.ticket_id
      AND (tickets.owner_id = auth.uid() OR public.is_team_member(auth.uid()))
    )
    AND (NOT is_internal OR public.is_team_member(auth.uid()))
  );

CREATE POLICY "Ticket participants can create messages"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.tickets
      WHERE tickets.id = ticket_messages.ticket_id
      AND (tickets.owner_id = auth.uid() OR public.is_team_member(auth.uid()))
    )
  );

-- Policies for ticket_attachments
CREATE POLICY "Users can view attachments from their tickets"
  ON public.ticket_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets
      WHERE tickets.id = ticket_attachments.ticket_id
      AND (tickets.owner_id = auth.uid() OR public.is_team_member(auth.uid()))
    )
  );

CREATE POLICY "Users can upload attachments to their tickets"
  ON public.ticket_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets
      WHERE tickets.id = ticket_attachments.ticket_id
      AND (tickets.owner_id = auth.uid() OR public.is_team_member(auth.uid()))
    )
  );

-- Policies for charges
CREATE POLICY "Owners can view their charges"
  ON public.charges FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Team can view all charges"
  ON public.charges FOR SELECT
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team can create charges"
  ON public.charges FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Team can update charges"
  ON public.charges FOR UPDATE
  USING (public.is_team_member(auth.uid()));

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false);

-- Storage policies for attachments
CREATE POLICY "Users can view attachments from their tickets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_team_member(auth.uid())
    )
  );

CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_charges_updated_at
  BEFORE UPDATE ON public.charges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    'pending_owner',
    'pending'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to set SLA due date on ticket creation
CREATE OR REPLACE FUNCTION public.set_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.priority = 'urgente' THEN
    NEW.sla_due_at = NEW.created_at + INTERVAL '6 hours';
  ELSE
    NEW.sla_due_at = NEW.created_at + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ticket_sla_trigger
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_sla();