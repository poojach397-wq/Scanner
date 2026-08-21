import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { totpApiKey, totpSecret, capitalAmount } = await request.json();

    if (!totpApiKey || !totpSecret) {
      return NextResponse.json({ error: "Both TOTP API Key and Secret are required" }, { status: 400 });
    }

    // Single-user setup: check if a row already exists and update it, else insert.
    const { data: existing } = await supabase.from("broker_credentials").select("id").maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("broker_credentials")
        .update({
          totp_api_key: totpApiKey,
          totp_secret: totpSecret,
          capital_amount: capitalAmount ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      const { error } = await supabase.from("broker_credentials").insert({
        totp_api_key: totpApiKey,
        totp_secret: totpSecret,
        capital_amount: capitalAmount ?? 0,
      });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to save settings:", err);
    return NextResponse.json({ error: err.message || "Failed to save settings" }, { status: 500 });
  }
}
