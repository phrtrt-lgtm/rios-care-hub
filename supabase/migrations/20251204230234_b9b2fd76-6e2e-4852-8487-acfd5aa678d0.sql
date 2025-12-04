-- Enable pg_net extension for HTTP calls from database triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to send push notification when notification is inserted
CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  request_id INT;
BEGIN
  -- Get Supabase URL and service role key from vault or use hardcoded values
  supabase_url := 'https://ktzfovzwayfqczytmhno.supabase.co';
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If service_role_key is not available, try to get from environment
  IF service_role_key IS NULL OR service_role_key = '' THEN
    -- Skip sending push if we can't authenticate
    RAISE NOTICE 'Service role key not available, skipping push notification';
    RETURN NEW;
  END IF;

  -- Make async HTTP request to send-push edge function
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
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

  RAISE NOTICE 'Push notification request sent with id: %', request_id;

  RETURN NEW;
END;
$$;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS on_notification_created ON public.notifications;

CREATE TRIGGER on_notification_created
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();