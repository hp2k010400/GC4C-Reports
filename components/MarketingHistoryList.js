import { useEffect, useState } from 'react'

// Shared "which of these have we already done" tracking list for both the
// Brand Hub and Model Collection tools — same shape, different endpoints.
export default function MarketingHistoryList({ title, listEndpoint, resetEndpoint, baseUrl, onUseHandle }) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [resetting, setResetting] = useState(null)

  async function load() {
    setError(null)
    try {
      const res = await fetch(listEndpoint)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setItems(data.items)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => { load() }, [])

  async function handleReset(handle) {
    const sure = window.confirm(
      `This removes it from this list by clearing its template back to the theme default.\n\n${baseUrl}${handle}\n\nThe page/collection itself isn't deleted — just unassigned from this design.\n\nContinue?`
    )
    if (!sure) return
    setResetting(handle)
    try {
      const res = await fetch(resetEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setResetting(null)
    }
  }

  return (
    <div className="settings-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="settings-section-title" style={{ marginBottom: 0 }}>{title}</h3>
        <button className="btn btn-secondary" onClick={load} style={{ fontSize: 12 }}>Refresh</button>
      </div>

      {error && <div style={{ fontSize: 12.5, color: '#c0392b', marginBottom: 8 }}>{error}</div>}
      {items === null && !error && <div style={{ fontSize: 13, color: '#888' }}>Loading…</div>}
      {items && items.length === 0 && <div style={{ fontSize: 13, color: '#888' }}>None done yet.</div>}

      {items && items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#888', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '6px 8px' }}>Title</th>
                <th style={{ padding: '6px 8px' }}>Handle</th>
                <th style={{ padding: '6px 8px' }}>Last updated</th>
                <th style={{ padding: '6px 8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.handle} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{item.title}</td>
                  <td style={{ padding: '8px' }}><code>{item.handle}</code></td>
                  <td style={{ padding: '8px', color: '#888' }}>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td style={{ padding: '8px', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <a className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} href={`${baseUrl}${item.handle}`} target="_blank" rel="noopener noreferrer">View</a>
                    {onUseHandle && (
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onUseHandle(item.handle)}>Edit</button>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '4px 10px', color: '#c0392b' }}
                      onClick={() => handleReset(item.handle)}
                      disabled={resetting === item.handle}
                    >
                      {resetting === item.handle ? 'Removing…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
