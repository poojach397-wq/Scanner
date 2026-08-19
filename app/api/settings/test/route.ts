import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGrowwAccessToken } from "@/lib/growwAuth";

export async function POST() {
  const { data: creds, error } = await supabase
    .from("broker_credentials")
    .select("totp_api_key, totp_secret")
    .maybeSingle();

  if (error || !creds) {
    return NextResponse.json({ error: "No saved credentials found - save settings first" }, { status: 400 });
  }

  try {
    const accessToken = await getGrowwAccessToken(creds.totp_api_key, creds.totp_secret);
    return NextResponse.json({ success: true, tokenPreview: accessToken.slice(0, 12) + "..." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Connection test failed" }, { status: 500 });
  }
}
