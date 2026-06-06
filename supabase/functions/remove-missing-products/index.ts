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
    // The previous implementation using .not("source_id", "in", ...) can be flaky with large lists
    const { data: existingProducts, error: fetchError } = await supabase
      .from("announced_products")
      .select("id, source_id")
      .not("source_id", "is", null);

    if (fetchError) throw fetchError;

    // Filter products that are in our DB but NOT in the provided source_ids list
    const toDelete = existingProducts
      .filter(p => !source_ids.includes(Number(p.source_id)))
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

    console.log(`Removed ${count} products missing from source.`);

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