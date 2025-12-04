-- Add update policy for push subscriptions
CREATE POLICY "Owners can update their own subscriptions"
ON public.push_subscriptions
FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Add unique constraint for upsert to work properly
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_owner_endpoint_key;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_owner_endpoint_key UNIQUE (owner_id, endpoint);