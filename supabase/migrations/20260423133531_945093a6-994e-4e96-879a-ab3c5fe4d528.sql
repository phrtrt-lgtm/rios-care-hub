-- =====================================================================
-- 1. Tabela de comentários para vistorias
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.inspection_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.cleaning_inspections(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  mentioned_user_ids uuid[] NOT NULL DEFAULT '{}',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_comments_inspection
  ON public.inspection_comments(inspection_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inspection_comments_author
  ON public.inspection_comments(author_id);

ALTER TABLE public.inspection_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: equipe sempre; proprietário se vê a vistoria
CREATE POLICY "Team can view inspection comments"
  ON public.inspection_comments FOR SELECT
  TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Owners can view comments on visible inspections"
  ON public.inspection_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cleaning_inspections ci
      JOIN public.properties p ON p.id = ci.property_id
      WHERE ci.id = inspection_comments.inspection_id
        AND ci.internal_only = false
        AND p.owner_id = auth.uid()
        AND (
          ci.is_routine = true
          OR EXISTS (
            SELECT 1 FROM public.inspection_settings s
            WHERE s.property_id = p.id AND s.owner_portal_enabled = true
          )
        )
    )
  );

-- INSERT: autor = auth.uid e tem que ter acesso de leitura à vistoria
CREATE POLICY "Authorized users can insert inspection comments"
  ON public.inspection_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_team_member(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.cleaning_inspections ci
        JOIN public.properties p ON p.id = ci.property_id
        WHERE ci.id = inspection_comments.inspection_id
          AND ci.internal_only = false
          AND p.owner_id = auth.uid()
          AND (
            ci.is_routine = true
            OR EXISTS (
              SELECT 1 FROM public.inspection_settings s
              WHERE s.property_id = p.id AND s.owner_portal_enabled = true
            )
          )
      )
    )
  );

-- UPDATE: só autor, em até 15 min, e só edita corpo/edited_at/mentions/attachments
CREATE POLICY "Author can edit own comment within 15 minutes"
  ON public.inspection_comments FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    AND deleted_at IS NULL
    AND created_at > (now() - INTERVAL '15 minutes')
  )
  WITH CHECK (
    author_id = auth.uid()
  );

-- UPDATE soft-delete: autor sempre, admin sempre
CREATE POLICY "Author or admin can soft-delete"
  ON public.inspection_comments FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.inspection_comments;

-- =====================================================================
-- 2. Adicionar mentioned_user_ids nas tabelas de mensagens existentes
-- =====================================================================
ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.charge_messages
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.booking_commission_messages
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

-- =====================================================================
-- 3. Função para listar usuários mencionáveis em uma vistoria
--    (equipe + proprietário do imóvel)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_inspection_mentionable_users(_inspection_id uuid)
RETURNS TABLE (id uuid, name text, role text, photo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.role::text, p.photo_url
  FROM public.profiles p
  WHERE p.role IN ('admin'::app_role, 'agent'::app_role, 'maintenance'::app_role)
     OR p.id IN (
       SELECT pr.owner_id
       FROM public.cleaning_inspections ci
       JOIN public.properties pr ON pr.id = ci.property_id
       WHERE ci.id = _inspection_id
     )
  ORDER BY p.name;
$$;

-- =====================================================================
-- 4. Função para listar mencionáveis em um chamado (ticket)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_ticket_mentionable_users(_ticket_id uuid)
RETURNS TABLE (id uuid, name text, role text, photo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.role::text, p.photo_url
  FROM public.profiles p
  WHERE p.role IN ('admin'::app_role, 'agent'::app_role, 'maintenance'::app_role)
     OR p.id IN (SELECT t.owner_id FROM public.tickets t WHERE t.id = _ticket_id)
  ORDER BY p.name;
$$;

-- =====================================================================
-- 5. Função para listar mencionáveis em uma cobrança
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_charge_mentionable_users(_charge_id uuid)
RETURNS TABLE (id uuid, name text, role text, photo_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.role::text, p.photo_url
  FROM public.profiles p
  WHERE p.role IN ('admin'::app_role, 'agent'::app_role, 'maintenance'::app_role)
     OR p.id IN (SELECT c.owner_id FROM public.charges c WHERE c.id = _charge_id)
  ORDER BY p.name;
$$;