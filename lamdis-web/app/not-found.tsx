export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <html>
      <body>
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Page not found</h1>
          <p style={{ marginTop: 8 }}>The page you’re looking for doesn’t exist.</p>
        </div>
      </body>
    </html>
  );
}
