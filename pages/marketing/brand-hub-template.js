import { useState } from 'react'

// Real doc format (matches the actual TaylorMade Brand Hub doc), loose
// prose under section headings rather than strict "Label: value" pairs:
//   SEO Page Title: ...
//   SEO Meta Description: ...
//   Page Copy
//     ...intro note...
//     <H1 text> - H1
//     <paragraph>
//     <paragraph>
//   FAQs Blocks
//     Tier 1 - ...
//     Q? - <question>
//     A - <answer>
//     CTA LINK - <label>
//     ...
//   Child collection links Required
//     https://.../collections/...
//     ...
//   long-form descriptions
//     <Why Brand heading>
//     <paragraph>...
//   Other Clubs suggestions
//     https://.../collections/...
//   Trade-Ins
//     <paragraph>...
//   Go to the clubhouse
//     <paragraph>
//     CTA LINK: <url>

// CTA label -> real URL. Anything not matched here is left unlinked rather
// than guessed, since a wrong link is worse than no link.
function resolveCtaUrl(label, guidesUrl) {
  const l = (label || '').toLowerCase()
  if (l.includes('condition')) return '/pages/condition-rating-guide'
  if (l.includes('bag') || l.includes('blog')) return guidesUrl || ''
  if (l.includes('delivery')) return '/pages/delivery'
  if (l.includes('brand hub')) return '/collections/all'
  return '' // "MODELS", "fake drivers guide", etc. — no confirmed real URL, left blank on purpose
}

function sectionText(text, startLabel, endLabels) {
  const startIdx = text.search(new RegExp('^' + startLabel + '\\s*$', 'm'))
  if (startIdx === -1) return ''
  const after = text.slice(startIdx + startLabel.length)
  let endIdx = after.length
  for (const end of endLabels) {
    const idx = after.search(new RegExp('^' + end + '\\s*$', 'm'))
    if (idx !== -1 && idx < endIdx) endIdx = idx
  }
  return after.slice(0, endIdx).trim()
}

function parseBrandHubDoc(text) {
  const get = (label) => {
    const m = text.match(new RegExp('^' + label + ':\\s*(.*)$', 'm'))
    return m ? m[1].trim() : ''
  }

  const pageTitle = get('SEO Page Title')
  const metaDescription = get('SEO Meta Description')
  const suggestedLine = (text.match(/^Suggested URL\(s?\):\s*([\s\S]*?)$/m) || [])[1] || ''
  const firstUrl = (suggestedLine.match(/https?:\/\/\S+/) || [])[0] || ''
  const handle = firstUrl.split('/').filter(Boolean).pop() || ''

  const SECTION_MARKERS = [
    'Page Copy', 'FAQs Blocks', 'Child collection links Required',
    'Other brand hubs', 'long-form descriptions', 'Other Clubs suggestions',
    'Trade-Ins', 'Why Choose Us', 'Go to the clubhouse',
  ]

  const pageCopy = sectionText(text, 'Page Copy', SECTION_MARKERS)
  const pcLines = pageCopy.split('\n').map(l => l.trim()).filter(Boolean)
  let h1 = ''
  const heroParagraphs = []
  for (const line of pcLines) {
    if (/-\s*H1\s*$/.test(line)) {
      h1 = line.replace(/-\s*H1\s*$/, '').trim()
    } else if (!/^(meta titles|proposed page example)/i.test(line)) {
      heroParagraphs.push(line)
    }
  }

  const guidesUrlGlobal = (text.match(/Go to the clubhouse[\s\S]*?(https?:\/\/\S+)/) || [])[1] || ''

  const faqBlock = sectionText(text, 'FAQs Blocks', SECTION_MARKERS)
  const faqLines = faqBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const faqs = []
  let tier = ''
  let current = null
  for (const line of faqLines) {
    if (/^Tier \d/i.test(line)) {
      tier = line.split('-')[0].trim()
      continue
    }
    const qMatch = line.match(/^Q\??\s*[-:]?\s*(.+)$/)
    const aMatch = line.match(/^A\s*[-:]\s*(.+)$/)
    const ctaMatch = line.match(/^CTA LINK\s*[-:]?\s*(.+)$/i)
    if (qMatch && !aMatch) {
      if (current) faqs.push(current)
      current = { tier, q: qMatch[1].trim(), a: '', ctaText: '', ctaUrl: '' }
    } else if (aMatch && current) {
      current.a = aMatch[1].trim()
    } else if (ctaMatch && current) {
      current.ctaText = ctaMatch[1].trim()
      current.ctaUrl = resolveCtaUrl(ctaMatch[1].trim(), guidesUrlGlobal)
    } else if (current && !current.a) {
      current.q += ' ' + line
    }
  }
  if (current) faqs.push(current)

  const extractUrls = (blockText) =>
    (blockText.match(/https?:\/\/\S+/g) || [])

  const mainCategoryUrls = extractUrls(sectionText(text, 'Child collection links Required', SECTION_MARKERS))
  const otherCategoryUrls = extractUrls(sectionText(text, 'Other Clubs suggestions', SECTION_MARKERS))

  const longForm = sectionText(text, 'long-form descriptions', SECTION_MARKERS)
  const lfLines = longForm.split('\n').map(l => l.trim()).filter(Boolean)
  const whyBrandHeading = lfLines[0] || ''
  const whyBrandParagraphs = lfLines.slice(1)

  const tradeInBlock = sectionText(text, 'Trade-Ins', SECTION_MARKERS)
  const tradeInParagraphs = tradeInBlock.split('\n').map(l => l.trim()).filter(Boolean)

  const clubhouseBlock = sectionText(text, 'Go to the clubhouse', [])
  const clubhouseLines = clubhouseBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const guidesBody = clubhouseLines.filter(l => !/^CTA LINK/i.test(l)).join(' ')
  const guidesUrl = guidesUrlGlobal

  return {
    handle, pageTitle, metaDescription, h1, heroParagraphs,
    whyBrandHeading, whyBrandParagraphs,
    mainCategoryUrls, otherCategoryUrls,
    faqs, tradeInParagraphs, guidesUrl, guidesBody,
  }
}

const EMPTY = {
  handle: '', pageTitle: '', metaDescription: '', h1: '', heroParagraphs: [],
  whyBrandHeading: '', whyBrandParagraphs: [], mainCategoryUrls: [], otherCategoryUrls: [],
  faqs: [], tradeInParagraphs: [], guidesUrl: '', guidesBody: '',
}

export default function BrandHubTemplate() {
  const [docText, setDocText] = useState('')
  const [brandName, setBrandName] = useState('TaylorMade')
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
        body: JSON.stringify({ handle: targetHandle.trim(), brandName, ...parsed }),
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
        One shared template for the ~16 Brand Hub pages, matching the real doc structure: editorial H1, two GA4-ordered category tile rows,
        3-tier FAQs with CTA links, brand trade-in copy, shared Why Choose Us, and a guides CTA.
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">1. Paste the copy doc</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <label className="settings-label" style={{ alignSelf: 'center' }}>Brand name</label>
          <input className="form-input" style={{ width: 200 }} value={brandName} onChange={e => setBrandName(e.target.value)} />
        </div>
        <textarea
          className="form-input"
          style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12.5 }}
          placeholder="Paste the full brand hub doc text here..."
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
        {[
          ['Handle', parsed.handle],
          ['Page title', parsed.pageTitle],
          ['H1', parsed.h1],
          ['Hero paragraphs', parsed.heroParagraphs.length],
          ['Why-brand heading', parsed.whyBrandHeading],
          ['Why-brand paragraphs', parsed.whyBrandParagraphs.length],
          ['Main categories', parsed.mainCategoryUrls.length],
          ['Other categories', parsed.otherCategoryUrls.length],
          ['FAQs', parsed.faqs.length],
          ['Trade-in paragraphs', parsed.tradeInParagraphs.length],
          ['Guides URL', parsed.guidesUrl],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: '#888' }}>{label}</span><span>{value || '—'}</span>
          </div>
        ))}
        {parsed.faqs.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>FAQ CTA links resolved (blank = no confident match, left unlinked on purpose):</div>
            {parsed.faqs.map((f, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: '3px 0' }}>
                <strong>{f.q}</strong> {f.ctaText && <span style={{ color: f.ctaUrl ? '#1a7a2e' : '#c0392b' }}>[{f.ctaText} &rarr; {f.ctaUrl || 'unresolved'}]</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
