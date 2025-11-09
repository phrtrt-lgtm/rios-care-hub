-- Add maintenance_date column to charges table
ALTER TABLE charges ADD COLUMN maintenance_date DATE;

COMMENT ON COLUMN charges.maintenance_date IS 'Data em que ocorreu a manutenção ou problema reportado';