/** The embed card for a market that does not exist or is not public. */
export default function EmbedNotFound() {
  return (
    <main
      style={{
        margin: '8px auto',
        maxWidth: 600,
        padding: 16,
        borderRadius: 16,
        border: '1px solid rgba(128,128,128,0.3)',
        font: '14px/1.5 system-ui, sans-serif',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>This market is not available.</p>
      <p style={{ margin: '4px 0 0', opacity: 0.7 }}>It may still be in review, or the link is wrong.</p>
    </main>
  )
}
