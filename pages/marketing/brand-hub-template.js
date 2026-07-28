import { useState } from 'react'

// Doc format (matches the labeled style Murray already uses for brand hubs):
//   Suggested URL: https://www.golfclubs4cash.co.uk/pages/callaway-odyssey-brand-page
//   Hero Heading: Callaway: A Golfing Powerhouse
//   Hero Body: ...
//   Hero CTA: Shop Callaway here!
//   Hero CTA URL: /collections/callaway
//   Why Choose Heading: Why Choose Callaway & Odyssey?
//   Why Choose Body: ...
//   Category: Shop all Callaway EPIC Drivers | callaway-epic-drivers
//   Category: Shop all Odyssey Ten Putters | odyssey-ten
//   FAQs Required
//   Question line ending in ?
//   Answer line(s)...
function parseBrandHubDoc(text) {
  const get = (label) => {
    const m = text.match(new RegExp('^' + label + ':\\s*(.*)$', 'm'))
    return m ? m[1].trim() : ''
  }
  const getAll = (label) => {
    const re = new RegExp('^' + label + ':\\s*(.*)$', 'gm')
    const out = []
    let m
    while ((m = re.exec(text)) !== null) out.push(m[1].trim())
    return out
  }
  const categories = getAll('Category').map(c => {
    const [label, handle] = c.split('|').map(s => (s || '').trim())
    return { label, handle }
  })

  const faqSection = text.split(/^FAQs Required$/m)[1] || ''
  const lines = faqSection.split('\n').map(l => l.trim()).filter(Boolean)
  const faqs = []
  let current = null
  for (const line of lines) {
    if (line.endsWith('?')) {
      if (current) faqs.push(current)
      current = { q: line, a: '' }
    } else if (current) {
      current.a = (current.a ? current.a + ' ' : '') + line
    }
  }
  if (current) faqs.push(current)

  return {
    handle: get('Suggested URL').split('/').filter(Boolean).pop() || '',
    brandName: get('Brand Name'),
    heroHeading: get('Hero Heading'),
    heroBody: get('Hero Body'),
    heroCtaText: get('Hero CTA'),
    heroCtaUrl: get('Hero CTA URL'),
    whyHeading: get('Why Choose Heading'),
    whyBody: get('Why Choose Body'),
    categories,
    faqs,
  }
}

const SAMPLE_DOC = `Suggested URL: https://www.golfclubs4cash.co.uk/pages/callaway-odyssey-brand-page
Brand Name: Callaway
Hero Heading: Callaway: A Golfing Powerhouse
Hero Body: Callaway continues to lead the golf industry with its innovative approach to club design. Known for its groundbreaking technology, such as Jailbreak and AI-designed faces, Callaway clubs offer improved distance, accuracy, and forgiveness.
Hero CTA: Shop Callaway here!
Hero CTA URL: /collections/callaway
Why Choose Heading: Why Choose Callaway & Odyssey?
Why Choose Body: Callaway's innovative technology, like Jailbreak and AI-designed faces, offers enhanced distance and forgiveness, making their clubs ideal for players looking for both performance and ease of use.
Category: Shop all Callaway EPIC Drivers | callaway-epic-drivers
Category: Shop all Odyssey Ten Putters | odyssey-ten
Category: Shop all Callaway Rogue Iron Sets | callaway-rogue-iron-sets
Category: Shop all Callaway Ai Smoke Hybrids | callaway-ai-smoke-hybrids
FAQs Required
Is Callaway a good golf brand?
Yes, Callaway is highly regarded for its innovative technologies, consistently offering clubs that provide excellent performance, forgiveness, and distance.
Do pros use Callaway?
Yes, top players such as Jon Rahm and Phil Mickelson use Callaway clubs, endorsing the brand for its performance at the highest levels of golf.`

const EMPTY = { handle: '', brandName: '', heroHeading: '', heroBody: '', heroCtaText: '', heroCtaUrl: '', whyHeading: '', whyBody: '', categories: [], faqs: [] }

export default function BrandHubTemplate() {
  const [docText, setDocText] = useState(SAMPLE_DOC)
  const [parsed, setParsed] = useState(EMPTY)
  const [status, setStatus] = useState('')
  const [targetHandle, setTargetHandle] = useState('marketing-automation-test-page')
  const [pushState, setPushState] = useState('idle')
  const [pushError, setPushError] = useState(null)
  const [originalContent, setOriginalContent] = useState(null)

  function handleParse() {
    setParsed(parseBrandHubDoc(docText))
    setStatus('Loaded ' + new Date().toLocaleTimeString())
  }

  async function handlePushLive() {
    if (!targetHandle.trim()) return
    const sure = window.confirm(
      `This writes to the page's metafields and assigns the shared brand-hub template.\n\nIt'll be visible on:\nhttps://www.golfclubs4cash.co.uk/pages/${targetHandle}\n\nContinue?`
    )
    if (!sure) return
    setPushState('pushing')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/brand-hub-push-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: targetHandle.trim(), ...parsed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOriginalContent(data.original)
      setPushState('live')
    } catch (err) {
      setPushState('error')
      setPushError(err.message)
    }
  }

  async function handleRevert() {
    if (!targetHandle.trim() || !originalContent) return
    setPushState('reverting')
    setPushError(null)
    try {
      const res = await fetch('/api/marketing/brand-hub-revert-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: targetHandle.trim(), original: originalContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOriginalContent(null)
      setPushState('idle')
    } catch (err) {
      setPushState('error')
      setPushError(err.message)
    }
  }

  return (
    <div className="container">
      <div className="page-title">Brand Hub Template</div>
      <div className="page-sub">
        One shared template for the ~16 Brand Hub pages, modelled on the real Callaway/Odyssey page Will called out as the reference.
        Paste a doc below to preview and push it.
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">1. Paste the copy doc</h3>
        <textarea
          className="form-input"
          style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: 12.5 }}
          value={docText}
          onChange={e => setDocText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button className="btn btn-primary" onClick={handleParse} disabled={!docText.trim()}>Show preview</button>
          {status && <span style={{ fontSize: 12, color: '#888' }}>{status}</span>}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #ddd' }}>
          <label className="settings-label" style={{ display: 'block', marginBottom: 6 }}>Test page to push to (its own dedicated, unlinked URL)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="form-input" style={{ width: 340 }} value={targetHandle} onChange={e => setTargetHandle(e.target.value)} />
            <a className="btn btn-secondary" href={`https://www.golfclubs4cash.co.uk/pages/${targetHandle}`} target="_blank" rel="noopener noreferrer">View page</a>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {pushState !== 'live' ? (
            <button className="btn btn-primary" style={{ background: '#c0392b' }} onClick={handlePushLive} disabled={pushState === 'pushing' || !targetHandle.trim()}>
              {pushState === 'pushing' ? 'Pushing…' : 'Push live'}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleRevert} disabled={pushState === 'reverting'}>
              {pushState === 'reverting' ? 'Reverting…' : 'Revert (undo)'}
            </button>
          )}
          {pushState === 'live' && <span style={{ fontSize: 12.5, color: '#1a7a2e', fontWeight: 600 }}>Live on that test page now.</span>}
          {pushState === 'error' && <span style={{ fontSize: 12.5, color: '#c0392b' }}>{pushError}</span>}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Parsed fields</h3>
        <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}><span style={{ color: '#888' }}>Handle</span><span>{parsed.handle || '—'}</span></div>
        <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}><span style={{ color: '#888' }}>Hero heading</span><span>{parsed.heroHeading || '—'}</span></div>
        <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}><span style={{ color: '#888' }}>Categories</span><span>{parsed.categories.map(c => c.label).join(', ') || '—'}</span></div>
        <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}><span style={{ color: '#888' }}>FAQs</span><span>{parsed.faqs.length}</span></div>
      </div>
    </div>
  )
}
