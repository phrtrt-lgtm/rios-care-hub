import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create client with Auth context
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Extract token and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    console.log('Authenticated user:', user.id);

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if requesting user is admin using admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('User profile:', profile);

    if (profileError || profile?.role !== 'admin') {
      throw new Error('User must be an admin to delete users');
    }

    // Get the user ID to delete from request body
    const { userId } = await req.json();
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Prevent admins from deleting other admins
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (targetProfile?.role === 'admin') {
      throw new Error('Cannot delete admin users');
    }

    console.log('Deleting user and related data for:', userId);

    // First, remove any foreign key references to this user
    // Update properties where this user is assigned as cleaner
    await supabaseAdmin
      .from('properties')
      .update({ assigned_cleaner_id: null })
      .eq('assigned_cleaner_id', userId);

    // Update properties where this user is the owner
    // Note: This might need different handling depending on business logic
    // For now, we'll just log if there are any
    const { data: ownedProperties } = await supabaseAdmin
      .from('properties')
      .select('id')
      .eq('owner_id', userId);

    if (ownedProperties && ownedProperties.length > 0) {
      console.log(`Warning: User owns ${ownedProperties.length} properties. These will be cascade deleted.`);
    }
    
    // Delete the user using admin client - this will cascade delete the profile
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Database error deleting user:', deleteError);
      throw new Error('Database error deleting user');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error deleting user:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
