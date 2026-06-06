import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RemoveSchema = z.object({
  source_ids: z.array(z.number()),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    console.log("Receiving product removal request:", JSON.stringify(rawBody));
    
    const parsed = RemoveSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { source_ids } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // We need to fetch all existing source_ids to compare correctly
    const { data: existingProducts, error: fetchError } = await supabase
      .from("announced_products")
      .select("id, name, source_id");

    if (fetchError) throw fetchError;

    console.log(`Found ${existingProducts?.length || 0} total products in database.`);

    // Filter products that have a source_id in our DB but are NOT in the provided source_ids list
    const toDelete = existingProducts
      .filter(p => {
        // Only consider products that have a source_id (came from the external system)
        if (p.source_id === null || p.source_id === undefined) return false;
        
        // Convert to number to ensure proper comparison
        const sId = Number(p.source_id);
        const isStillInSource = source_ids.includes(sId);
        
        if (!isStillInSource) {
          console.log(`Product "${p.name}" (ID: ${p.id}, SourceID: ${sId}) is missing from source list.`);
        }
        
        return !isStillInSource;
      })
      .map(p => p.id);

    let count = 0;
    if (toDelete.length > 0) {
      console.log(`Attempting to delete ${toDelete.length} products:`, toDelete);
      
      const { error: deleteError, count: deletedCount } = await supabase
        .from("announced_products")
        .delete({ count: "exact" })
        .in("id", toDelete);

      if (deleteError) throw deleteError;
      count = deletedCount || 0;
    }

    console.log(`Successfully removed ${count} products.`);

    return new Response(
      JSON.stringify({ success: true, removed_count: count }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error removing products:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});