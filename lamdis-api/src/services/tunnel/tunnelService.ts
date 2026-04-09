/**
 * Tunnel Service — exposes local API to the internet via ngrok.
 *
 * Enables inbound webhooks (Twilio SMS, etc.) to reach localhost.
 * Opt-in via TUNNEL_ENABLED=true + NGROK_AUTHTOKEN env vars.
 */

let publicUrl: string | null = null;

export async function startTunnel(port: number): Promise<string | null> {
  // Allow overriding with a pre-existing public URL
  if (process.env.TUNNEL_PUBLIC_URL) {
    publicUrl = process.env.TUNNEL_PUBLIC_URL.replace(/\/$/, '');
    console.log(`[tunnel] Using configured public URL: ${publicUrl}`);
    return publicUrl;
  }

  if (process.env.TUNNEL_ENABLED !== 'true') {
    return null;
  }

  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    console.warn('[tunnel] TUNNEL_ENABLED=true but NGROK_AUTHTOKEN not set. Skipping.');
    return null;
  }

  try {
    const ngrok = await import('@ngrok/ngrok');
    const listener = await ngrok.forward({
      addr: port,
      authtoken,
    });
    publicUrl = listener.url()!;
    console.log(`[tunnel] Public URL: ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.error(`[tunnel] Failed to start ngrok: ${err?.message}`);
    return null;
  }
}

export function getPublicUrl(): string | null {
  return publicUrl;
}
