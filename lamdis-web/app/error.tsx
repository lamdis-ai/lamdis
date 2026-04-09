'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Something went wrong</h1>
      <p style={{ marginTop: 8 }}>An unexpected error occurred{error?.digest ? ` (ref: ${error.digest})` : ''}.</p>
      <button onClick={() => reset()} style={{ marginTop: 12, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6 }}>
        Try again
      </button>
    </div>
  );
}
