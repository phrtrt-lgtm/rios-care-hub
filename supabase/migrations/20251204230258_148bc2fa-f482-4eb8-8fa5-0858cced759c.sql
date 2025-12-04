-- Update trigger function to use anon key (public key is safe to use)
CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  request_id INT;
BEGIN
  -- Make async HTTP request to send-push edge function using anon key
  SELECT net.http_post(
    url := 'https://ktzfovzwayfqczytmhno.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0emZvdnp3YXlmcWN6eXRtaG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MjY0NDksImV4cCI6MjA3NzAwMjQ0OX0.Lq8qM4BHoxhZ1uTbsIdlRdv_1ZQMFySqW4S0-2eA-HE',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0emZvdnp3YXlmcWN6eXRtaG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MjY0NDksImV4cCI6MjA3NzAwMjQ0OX0.Lq8qM4BHoxhZ1uTbsIdlRdv_1ZQMFySqW4S0-2eA-HE'
    ),
    body := jsonb_build_object(
      'ownerId', NEW.owner_id::text,
      'payload', jsonb_build_object(
        'title', NEW.title,
        'body', NEW.message,
        'url', COALESCE(NEW.reference_url, '/'),
        'tag', NEW.type
      )
    )
  ) INTO request_id;

  RETURN NEW;
END;
$$;