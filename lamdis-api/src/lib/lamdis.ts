let client: any = null;

export async function getLamdis() {
  if (client) return client;
  const key = process.env.LAMDIS_SDK_API_KEY;
  if (!key) return null;
  const { Lamdis } = await import('@lamdis-ai/sdk');
  client = new Lamdis({
    apiKey: key,
    endpoint: process.env.LAMDIS_INGEST_URL || 'http://localhost:3102',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'staging',
  });
  return client;
}

export async function shutdownLamdis() {
  if (client) await client.shutdown();
}
