-- ============================================================
-- Financial Reports: arquivamento, exclusão controlada e audit log
-- ============================================================

-- 1) Novos campos em financial_reports
ALTER TABLE public.financial_reports
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_notes text;

-- Constraint de status (substitui qualquer prévia se existir)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_reports_status_check'
  ) THEN
    ALTER TABLE public.financial_reports DROP CONSTRAINT financial_reports_status_check;
  END IF;
END $$;

ALTER TABLE public.financial_reports
  ADD CONSTRAINT financial_reports_status_check
  CHECK (status IN ('draft','published','archived'));

CREATE INDEX IF NOT EXISTS idx_financial_reports_status
  ON public.financial_reports(status);
CREATE INDEX IF NOT EXISTS idx_financial_reports_owner_status
  ON public.financial_reports(owner_id, status);

-- 2) Tabela de audit log
CREATE TABLE IF NOT EXISTS public.financial_report_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','updated','archived','restored','deleted','published','regenerated')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  actor_role text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- FK separada para podermos definir ON DELETE CASCADE só nos vivos
-- (queremos manter o log mesmo quando o report é hard-deleted via RPC,
--  por isso NÃO usamos CASCADE aqui — o RPC insere o log antes de apagar)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_report_audit_log_report_fk'
  ) THEN
    ALTER TABLE public.financial_report_audit_log
      ADD CONSTRAINT financial_report_audit_log_report_fk
      FOREIGN KEY (report_id) REFERENCES public.financial_reports(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_report_id
  ON public.financial_report_audit_log(report_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON public.financial_report_audit_log(created_at DESC);

ALTER TABLE public.financial_report_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: team pode ver e inserir; owner não vê audit.
DROP POLICY IF EXISTS "Team can view audit log" ON public.financial_report_audit_log;
CREATE POLICY "Team can view audit log"
  ON public.financial_report_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_team_member(auth.uid()));

DROP POLICY IF EXISTS "Team can insert audit log" ON public.financial_report_audit_log;
CREATE POLICY "Team can insert audit log"
  ON public.financial_report_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));

-- 3) Ajustar RLS de financial_reports:
--    Owner NÃO deve ver relatórios arquivados.
DROP POLICY IF EXISTS "Owners can view own reports" ON public.financial_reports;
CREATE POLICY "Owners can view own active reports"
  ON public.financial_reports
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() AND status <> 'archived');

-- A política "Team can manage reports" (ALL) já existe e cobre admin/agent/maintenance.
-- Mas a regra de negócio é: apenas ADMIN edita/exclui/arquiva.
-- Como precisamos diferenciar SELECT (team) de UPDATE/DELETE (admin),
-- substituímos a policy ALL por policies específicas.
DROP POLICY IF EXISTS "Team can manage reports" ON public.financial_reports;

CREATE POLICY "Team can view all reports"
  ON public.financial_reports
  FOR SELECT
  TO authenticated
  USING (public.is_team_member(auth.uid()));

CREATE POLICY "Team can insert reports"
  ON public.financial_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));

CREATE POLICY "Admin can update reports"
  ON public.financial_reports
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete reports"
  ON public.financial_reports
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) RPC para hard-delete atômico (registra audit antes de deletar)
CREATE OR REPLACE FUNCTION public.delete_financial_report(
  p_report_id uuid,
  p_actor_name text,
  p_actor_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_snapshot jsonb;
  v_status text;
BEGIN
  -- Apenas admin
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir relatórios';
  END IF;

  SELECT to_jsonb(financial_reports.*), status
    INTO v_snapshot, v_status
  FROM public.financial_reports
  WHERE id = p_report_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Relatório não encontrado';
  END IF;

  -- Só permite excluir relatórios já arquivados (segurança em camadas)
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'Apenas relatórios arquivados podem ser excluídos permanentemente';
  END IF;

  INSERT INTO public.financial_report_audit_log
    (report_id, action, actor_id, actor_name, actor_role, details)
  VALUES (
    p_report_id, 'deleted', v_actor, p_actor_name, p_actor_role,
    jsonb_build_object('snapshot', v_snapshot)
  );

  DELETE FROM public.financial_reports WHERE id = p_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_financial_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_financial_report(uuid, text, text) TO authenticated;