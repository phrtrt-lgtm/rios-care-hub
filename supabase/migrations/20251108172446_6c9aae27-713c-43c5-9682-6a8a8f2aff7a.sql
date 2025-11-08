-- Remover política incorreta
DROP POLICY IF EXISTS "Owners and team can view charge message attachments" ON charge_message_attachments;

-- Criar política correta para visualização de anexos de mensagens
CREATE POLICY "Owners and team can view charge message attachments"
ON charge_message_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM charge_messages cm
    JOIN charges c ON c.id = cm.charge_id
    WHERE cm.id = charge_message_attachments.message_id
    AND (c.owner_id = auth.uid() OR is_team_member(auth.uid()))
  )
);