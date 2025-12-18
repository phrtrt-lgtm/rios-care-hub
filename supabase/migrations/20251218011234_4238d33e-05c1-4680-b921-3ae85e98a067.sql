-- Store the cron token in system_config for pg_cron access
INSERT INTO system_config (key, value, updated_at)
VALUES ('charge_cron_token', '"charge_internal_cron_2024"'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = '"charge_internal_cron_2024"'::jsonb, updated_at = now();

-- Update the invoke function to use the stored token
CREATE OR REPLACE FUNCTION public.invoke_charge_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_token TEXT;
BEGIN
  -- Get the token from system_config
  SELECT value::text FROM system_config WHERE key = 'charge_cron_token' INTO cron_token;
  -- Remove quotes from JSON text
  cron_token := trim(both '"' from cron_token);
  
  -- Make HTTP request to the charge-cron edge function
  PERFORM net.http_post(
    url := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/charge-cron?token=' || cron_token,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  
  RAISE LOG 'Charge cron invoked at %', now();
END;
$$;