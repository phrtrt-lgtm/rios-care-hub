-- Atualizar unidades existentes com o telefone do proprietário
UPDATE properties p
SET owner_phone = pr.phone
FROM profiles pr
WHERE p.owner_id = pr.id
AND p.owner_phone IS NULL
AND pr.phone IS NOT NULL;