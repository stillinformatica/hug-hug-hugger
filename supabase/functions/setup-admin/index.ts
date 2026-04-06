import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const adminEmail = "stillinformatica@stillinformatica.com.br";
    const adminPassword = "710119";

    // Check if user already exists
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    let adminUser = users.find(u => u.email === adminEmail);

    // Create user if not exists
    if (!adminUser) {
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { full_name: "Still Informática" },
      });
      if (createError) throw createError;
      adminUser = createData.user;
    } else {
      // Confirm email if not confirmed
      await supabase.auth.admin.updateUserById(adminUser.id, {
        email_confirm: true,
      });
    }

    // Insert admin role
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({ user_id: adminUser.id, role: "admin" }, { onConflict: "user_id,role" });
    if (roleError) throw roleError;

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Admin configurado com sucesso!", 
      userId: adminUser.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
