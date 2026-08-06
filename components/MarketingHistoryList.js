import { Fragment, useEffect, useState } from 'react'

// The dedicated test page/collection ends up in this list too (it picks up
// the real template every time it's used for testing), but "Remove" on it
// has no purpose — pushing again just overwrites it anyway — and clicking
// it by mistake has broken the in-progress test three times. Disabled for
// these specifically rather than hiding the row, since seeing it in the
// list (and being able to View/Edit it) is still wanted.
const NO_REMOVE_HANDLES = ['marketing-automation-test-page', 'marketing-automation-test', 'marketing-automation-test-article']

// Shared "which of these have we already done" tracking list for both the
// Brand Hub and Model Collection tools — same shape, different endpoints.
// seoEndpoint is optional: when passed, each row gets an "Edit SEO" toggle
// that GETs/POSTs {title, metaDescription} to it directly, without needing
// a full doc re-push — Murray asked for this after seeing the demo.
export default function MarketingHistoryList({ title, listEndpoint, resetEndpoint, seoEndpoint, baseUrl, onUseHandle }) {
  // baseUrl is a flat "{prefix}{handle}" URL. Blogs need both a blog handle
  // and article handle, so those items carry a ready-made viewUrl instead —
  // preferred over baseUrl+handle whenever it's present.
  const urlFor = (item) => item.viewUrl || `${baseUrl}${item.handle}`
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [resetting, setResetting] = useState(null)
  const [seoOpenHandle, setSeoOpenHandle] = useState(null)
  const [seoLoading, setSeoLoading] = useState(false)
  const [seoForm, setSeoForm] = useState({ title: '', metaDescription: '' })
  const [seoSaving, setSeoSaving] = useState(false)
  const [seoError, setSeoError] = useState(null)
  const [seoSavedHandle, setSeoSavedHandle] = useState(null)

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

  async function handleReset(handle, item) {
    const sure = window.confirm(
      `This removes it from this list by clearing its template back to the theme default.\n\n${urlFor(item)}\n\nThe page/collection/article itself isn't deleted — just unassigned from this design.\n\nContinue?`
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

  async function toggleSeo(handle) {
    setSeoSavedHandle(null)
    if (seoOpenHandle === handle) {
      setSeoOpenHandle(null)
      return
    }
    setSeoOpenHandle(handle)
    setSeoError(null)
    setSeoLoading(true)
    try {
      const res = await fetch(`${seoEndpoint}?handle=${encodeURIComponent(handle)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSeoForm({ title: data.title || '', metaDescription: data.metaDescription || '' })
    } catch (err) {
      setSeoError(err.message)
    } finally {
      setSeoLoading(false)
    }
  }

  async function saveSeo(handle) {
    setSeoSaving(true)
    setSeoError(null)
    try {
      const res = await fetch(seoEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, title: seoForm.title, metaDescription: seoForm.metaDescription }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSeoSavedHandle(handle)
      setSeoOpenHandle(null)
      await load()
    } catch (err) {
      setSeoError(err.message)
    } finally {
      setSeoSaving(false)
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
                <Fragment key={item.handle}>
                  <tr style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>{item.title}</td>
                    <td style={{ padding: '8px' }}><code>{item.handle}</code></td>
                    <td style={{ padding: '8px', color: '#888' }}>
                      {new Date(item.updatedAt).toLocaleString()}
                      {seoSavedHandle === item.handle && <span style={{ marginLeft: 8, color: '#1a7a2e', fontWeight: 600 }}>SEO saved</span>}
                    </td>
                    <td style={{ padding: '8px', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <a className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} href={urlFor(item)} target="_blank" rel="noopener noreferrer">View</a>
                      {onUseHandle && (
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onUseHandle(item.handle)}>Edit</button>
                      )}
                      {seoEndpoint && (
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleSeo(item.handle)}>
                          {seoOpenHandle === item.handle ? 'Close' : 'Edit SEO'}
                        </button>
                      )}
                      {NO_REMOVE_HANDLES.includes(item.handle) ? (
                        <span style={{ fontSize: 12, padding: '4px 10px', color: '#aaa' }} title="This is the dedicated test item — Remove is disabled since it'd just get pushed to again anyway.">
                          Test item
                        </span>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px', color: '#c0392b' }}
                          onClick={() => handleReset(item.handle, item)}
                          disabled={resetting === item.handle}
                        >
                          {resetting === item.handle ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {seoOpenHandle === item.handle && (
                    <tr>
                      <td colSpan={4} style={{ padding: '10px 8px 16px', background: '#fafafa', borderBottom: '1px solid #eee' }}>
                        {seoLoading ? (
                          <div style={{ fontSize: 13, color: '#888' }}>Loading current SEO title/description…</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640 }}>
                            <label style={{ fontSize: 11.5, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Google search title
                              <input
                                className="form-input"
                                style={{ width: '100%', marginTop: 4 }}
                                value={seoForm.title}
                                onChange={e => setSeoForm(f => ({ ...f, title: e.target.value }))}
                              />
                            </label>
                            <label style={{ fontSize: 11.5, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Meta description
                              <textarea
                                className="form-input"
                                style={{ width: '100%', marginTop: 4, minHeight: 60 }}
                                value={seoForm.metaDescription}
                                onChange={e => setSeoForm(f => ({ ...f, metaDescription: e.target.value }))}
                              />
                            </label>
                            {seoError && <div style={{ fontSize: 12.5, color: '#c0392b' }}>{seoError}</div>}
                            <div>
                              <button className="btn btn-primary" style={{ fontSize: 12.5 }} onClick={() => saveSeo(item.handle)} disabled={seoSaving}>
                                {seoSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
