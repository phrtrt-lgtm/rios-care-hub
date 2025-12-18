-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a function to call the charge-cron edge function
CREATE OR REPLACE FUNCTION public.invoke_charge_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_token TEXT;
  supabase_url TEXT;
BEGIN
  -- Get the cron secret token from vault (if using vault) or environment
  -- For now, we'll use the service role to call the function
  SELECT current_setting('app.settings.supabase_url', true) INTO supabase_url;
  
  -- Make HTTP request to the charge-cron edge function
  PERFORM net.http_post(
    url := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/charge-cron?token=' || 
           (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET_TOKEN' LIMIT 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  
  RAISE LOG 'Charge cron invoked at %', now();
END;
$$;

-- Schedule the cron job to run every day at 8:00 AM UTC (5:00 AM Brazil time)
SELECT cron.schedule(
  'daily-charge-reminders',
  '0 8 * * *',  -- Every day at 8:00 AM UTC
  $$SELECT public.invoke_charge_cron()$$
);