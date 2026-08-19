"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [totpApiKey, setTotpApiKey] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMsg("");

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpApiKey,
          totpSecret,
          capitalAmount: Number(capitalAmount) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed: ${res.status}`);
      }

      setStatus("saved");
      // Clear the sensitive fields from the form after a successful save -
      // they're now in the DB, no need to keep them visible on screen.
      setTotpApiKey("");
      setTotpSecret("");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong");
    }
  }

  async function handleTestConnection() {
    setTestResult("Testing...");
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      setTestResult(res.ok ? "✅ Connected - Groww access token generated successfully" : `❌ ${data.error}`);
    } catch (err: any) {
      setTestResult(`❌ ${err.message}`);
    }
  }

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "system-ui",
        background: "#0b0b0c",
        minHeight: "100vh",
        color: "#eee",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: "0.25rem" }}>Settings</h1>
      <p style={{ color: "#888", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Enter your Groww TOTP credentials (from groww.in/trade-api/api-keys) and your
        trading capital. Stored securely in your Supabase project - never exposed to
        the browser after saving.
      </p>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={labelStyle}>TOTP API Key (token)</label>
          <input
            type="password"
            value={totpApiKey}
            onChange={(e) => setTotpApiKey(e.target.value)}
            placeholder="eyJhbGciOi..."
            required
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>TOTP Secret</label>
          <input
            type="password"
            value={totpSecret}
            onChange={(e) => setTotpSecret(e.target.value)}
            placeholder="Base32 secret shown when you generated the key"
            required
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Capital to Invest (₹)</label>
          <input
            type="number"
            value={capitalAmount}
            onChange={(e) => setCapitalAmount(e.target.value)}
            placeholder="50000"
            required
            style={inputStyle}
          />
        </div>

        <button type="submit" disabled={status === "saving"} style={buttonStyle}>
          {status === "saving" ? "Saving..." : "Save Settings"}
        </button>

        {status === "saved" && (
          <p style={{ color: "#4ade80", fontSize: "0.85rem" }}>Saved successfully.</p>
        )}
        {status === "error" && (
          <p style={{ color: "#f87171", fontSize: "0.85rem" }}>{errorMsg}</p>
        )}
      </form>

      <div style={{ marginTop: "2rem", borderTop: "1px solid #262626", paddingTop: "1.5rem" }}>
        <button onClick={handleTestConnection} style={{ ...buttonStyle, background: "#1f2937" }}>
          Test Groww Connection
        </button>
        {testResult && (
          <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#aaa" }}>{testResult}</p>
        )}
        <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#555" }}>
          This checks that your saved credentials can generate a valid Groww access
          token right now - confirms the TOTP flow works before relying on the cron.
        </p>
      </div>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  color: "#aaa",
  marginBottom: "0.35rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: "6px",
  border: "1px solid #333",
  background: "#151517",
  color: "#eee",
  fontSize: "0.9rem",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.7rem",
  borderRadius: "6px",
  border: "none",
  background: "#059669",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.9rem",
};
