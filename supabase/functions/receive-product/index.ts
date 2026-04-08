import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  category: z.string().default(""),
  price: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  images: z.array(z.string()).default([]),
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

    const { name, description, category, price, images, upsert } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from("announced_products")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    let action = "created";

    if (existing && upsert) {
      const { error } = await supabase
        .from("announced_products")
        .update({
          description: description || null,
          category: category || null,
          price,
          images,
        })
        .eq("id", existing.id);

      if (error) throw error;
      action = "updated";
    } else if (!existing) {
      const { error } = await supabase
        .from("announced_products")
        .insert({
          name,
          description: description || null,
          category: category || null,
          price,
          images,
        });

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
