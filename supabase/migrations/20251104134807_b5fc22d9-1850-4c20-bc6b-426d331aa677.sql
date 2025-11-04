-- Remover tabelas de manutenção não utilizadas
DROP TABLE IF EXISTS maintenance_events CASCADE;
DROP TABLE IF EXISTS maintenance_payments CASCADE;
DROP TABLE IF EXISTS maintenance_attachments CASCADE;
DROP TABLE IF EXISTS maintenances CASCADE;