import * as OTPAuth from "otpauth";

// Confirmed against Groww's docs (curl reference):
// POST https://api.groww.in/v1/token/api/access
// Headers: Authorization: Bearer <TOTP_API_KEY>
// Body: { "key_type": "totp", "totp": "<6-digit code>" }
// Response: { "token": "...", "expiry": "...", "isActive": true, ... }

function generateTOTPCode(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secretBase32),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  });
  return totp.generate();
}

export async function getGrowwAccessToken(totpApiKey: string, totpSecret: string): Promise<string> {
  const totpCode = generateTOTPCode(totpSecret);

  const res = await fetch("https://api.groww.in/v1/token/api/access", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${totpApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key_type: "totp", totp: totpCode }),
  });

  if (!res.ok) {
    throw new Error(`Groww auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.token) {
    throw new Error(`Groww auth response missing token: ${JSON.stringify(data)}`);
  }

  return data.token as string;
}
