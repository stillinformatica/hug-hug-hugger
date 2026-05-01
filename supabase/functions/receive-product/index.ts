import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ProductSchema = z.object({
  source_id: z.number().optional(),
  name: z.string().min(1),
  description: z.string().default(""),
  category: z.string().default(""),
  price: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  quantity: z.number().default(0),
  images: z.array(z.string()).default([]),
  weight: z.number().optional().default(0.5),
  height: z.number().optional().default(10),
  width: z.number().optional().default(15),
  length: z.number().optional().default(15),
  isTesting: z.boolean().default(false),
  upsert: z.boolean().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = ProductSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { source_id, name, description, category, price, quantity, images, weight, height, width, length, isTesting, upsert } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Match by source_id first, then fallback to name
    let existing = null;
    if (source_id) {
      const { data } = await supabase
        .from("announced_products")
        .select("id")
        .eq("source_id", source_id)
        .maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await supabase
        .from("announced_products")
        .select("id")
        .eq("name", name)
        .maybeSingle();
      existing = data;
    }

    let action = "created";
    const payload = {
      name,
      description: description || null,
      category: category || null,
      price,
      images,
      source_id: source_id || null,
      weight,
      height,
      width,
      length,
    };

    if (existing && upsert) {
      const { error } = await supabase
        .from("announced_products")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
      action = "updated";
    } else if (!existing) {
      const { error } = await supabase
        .from("announced_products")
        .insert(payload);
      if (error) throw error;
      action = "created";
    } else {
      action = "skipped (already exists)";
    }

    return new Response(
      JSON.stringify({ success: true, action }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error receiving product:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
