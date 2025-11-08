-- Adicionar política para owners verem perfis de autores de mensagens em suas cobranças
CREATE POLICY "Owners can view profiles of charge message authors"
ON profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM charge_messages cm
    JOIN charges c ON c.id = cm.charge_id
    WHERE cm.author_id = profiles.id
    AND c.owner_id = auth.uid()
  )
);