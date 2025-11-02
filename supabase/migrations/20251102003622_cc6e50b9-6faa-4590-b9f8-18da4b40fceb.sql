-- Habilitar RLS nas tabelas
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Ticket participants can create messages" ON ticket_messages;
DROP POLICY IF EXISTS "Users can view messages from their tickets" ON ticket_messages;
DROP POLICY IF EXISTS "Users can upload attachments to their tickets" ON ticket_attachments;
DROP POLICY IF EXISTS "Users can view attachments from their tickets" ON ticket_attachments;

-- Função helper para setar contexto de sessão
CREATE OR REPLACE FUNCTION set_session_context(p_role TEXT, p_owner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.role', p_role, true);
  PERFORM set_config('app.owner_id', COALESCE(p_owner_id::text, ''), true);
END;
$$;

-- Políticas para ticket_messages
-- Admin: acesso total
CREATE POLICY tm_admin_all ON ticket_messages
  FOR ALL
  USING (
    current_setting('app.role', true) = 'admin' 
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Agent: acesso total
CREATE POLICY tm_agent_all ON ticket_messages
  FOR ALL
  USING (
    current_setting('app.role', true) = 'agent'
    OR has_role(auth.uid(), 'agent'::app_role)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    OR has_role(auth.uid(), 'agent'::app_role)
  );

-- Owner: acesso aos próprios tickets
CREATE POLICY tm_owner_access ON ticket_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND (
          t.owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
          OR t.owner_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND (
          t.owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
          OR t.owner_id = auth.uid()
        )
    )
  );

-- Políticas para ticket_attachments
-- Admin: acesso total
CREATE POLICY ta_admin_all ON ticket_attachments
  FOR ALL
  USING (
    current_setting('app.role', true) = 'admin'
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'admin'
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Agent: acesso total
CREATE POLICY ta_agent_all ON ticket_attachments
  FOR ALL
  USING (
    current_setting('app.role', true) = 'agent'
    OR has_role(auth.uid(), 'agent'::app_role)
  )
  WITH CHECK (
    current_setting('app.role', true) = 'agent'
    OR has_role(auth.uid(), 'agent'::app_role)
  );

-- Owner: acesso aos anexos dos próprios tickets
CREATE POLICY ta_owner_access ON ticket_attachments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM ticket_messages m
      JOIN tickets t ON t.id = m.ticket_id
      WHERE m.id = ticket_attachments.message_id
        AND (
          t.owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
          OR t.owner_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ticket_messages m
      JOIN tickets t ON t.id = m.ticket_id
      WHERE m.id = ticket_attachments.message_id
        AND (
          t.owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid
          OR t.owner_id = auth.uid()
        )
    )
  );