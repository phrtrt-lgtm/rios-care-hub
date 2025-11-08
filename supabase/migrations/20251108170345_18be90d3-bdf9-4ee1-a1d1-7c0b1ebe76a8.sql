-- Adicionar foreign key constraint para author_id em charge_messages
ALTER TABLE charge_messages
ADD CONSTRAINT charge_messages_author_id_fkey 
FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;