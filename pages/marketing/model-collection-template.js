import { useState } from 'react'

const SECTION_HEADERS = [
  'Header & Footer Text',
  'Collection Description Copy',
  'Player Type Copy',
  'Other Clubs or Brands',
  'Generic Trade-In Copy',
  'Why Choose Us Copy',
  'FAQs Required',
  'Guides & Help Required',
]
const LABEL_FIELDS = ['Suggested URL', 'Page Title', 'Meta Description', 'Featured image', 'Alt Text']

function parseDoc(text) {
  const lines = text.split(/\r?\n/)
  const labels = {}
  const sections = {}
  let i = 0

  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (SECTION_HEADERS.some(h => line === h)) break
    const m = line.match(/^([A-Za-z &]+):\s*(.*)$/)
    if (m && LABEL_FIELDS.includes(m[1].trim())) {
      let val = m[2].trim()
      if (!val) {
        let j = i + 1
        while (j < lines.length && !lines[j].trim()) j++
        val = (lines[j] || '').trim()
        i = j
      }
      labels[m[1].trim()] = val
    }
  }

  let currentHeader = null
  let buffer = []
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (SECTION_HEADERS.includes(line)) {
      if (currentHeader) sections[currentHeader] = buffer.join('\n').trim()
      currentHeader = line
      buffer = []
    } else if (currentHeader) {
      buffer.push(lines[i])
    }
  }
  if (currentHeader) sections[currentHeader] = buffer.join('\n').trim()
  return { labels, sections }
}

function parseFaqs(sectionText) {
  const lines = (sectionText || '').split('\n').map(l => l.trim()).filter(Boolean)
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
  return faqs
}

function handleFromUrl(url) {
  const parts = (url || '').split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

function firstParagraphsOf(sectionText) {
  const lines = (sectionText || '').split('\n').map(l => l.trim()).filter(Boolean)
  return { title: lines[0] || '', body: lines.slice(1).join(' ') }
}

const EMPTY_PARSED = {
  handle: '', pageTitle: '', metaDescription: '',
  title: '', intro: '', faqs: [],
}

export default function ModelCollectionTemplate() {
  const [tab, setTab] = useState('preview')
  const [docText, setDocText] = useState('')
  const [parsed, setParsed] = useState(EMPTY_PARSED)
  const [image, setImage] = useState(null)
  const [imageError, setImageError] = useState(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [status, setStatus] = useState('')

  async function handleParse() {
    const { labels, sections } = parseDoc(docText)
    const handle = handleFromUrl(labels['Suggested URL'])
    const { title, body } = firstParagraphsOf(sections['Header & Footer Text'])
    const faqs = parseFaqs(sections['FAQs Required'])

    setParsed({
      handle,
      pageTitle: labels['Page Title'] || '',
      metaDescription: labels['Meta Description'] || '',
      title,
      intro: body,
      faqs,
    })
    setStatus('Parsed ' + new Date().toLocaleTimeString())

    if (handle) {
      setLoadingImage(true)
      setImageError(null)
      try {
        const res = await fetch(`/api/marketing/lookup-image?handle=${encodeURIComponent(handle)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setImage(data)
      } catch (err) {
        setImage(null)
        setImageError(err.message)
      } finally {
        setLoadingImage(false)
      }
    } else {
      setImage(null)
      setImageError('No "Suggested URL" found in the doc, so there\'s no handle to look an image up for.')
    }
  }

  return (
    <div className="container">
      <div className="page-title">Model Collection Template</div>
      <div className="page-sub">
        CRO-informed template for the ~380 model collection pages (short copy above the grid, FAQ below — per Will&rsquo;s email).
        Paste a copy doc below to see it parsed and rendered live, with a real product image pulled from the live store.
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">1. Paste the copy doc</h3>
        <textarea
          className="form-input"
          style={{ width: '100%', minHeight: 180, fontFamily: 'monospace', fontSize: 12.5 }}
          placeholder="Paste the doc's plain text here (Suggested URL, Page Title, Meta Description, Header & Footer Text, FAQs Required, etc.)"
          value={docText}
          onChange={e => setDocText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleParse} disabled={!docText.trim()}>Parse &amp; preview</button>
          {parsed.handle && (
            <a
              className="btn btn-secondary"
              href={`https://www.golfclubs4cash.co.uk/collections/${parsed.handle}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View live page &#8599;
            </a>
          )}
          {status && <span style={{ fontSize: 12, color: '#888' }}>{status}</span>}
        </div>
        {parsed.handle && (
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
            Note: the live page won&rsquo;t show this content yet &mdash; the theme has no section reading these fields until we deploy one.
          </p>
        )}
      </div>

      <div className="settings-section" style={{ display: 'flex', gap: 8, padding: 12 }}>
        <button className={tab === 'preview' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('preview')}>Preview</button>
        <button className={tab === 'code' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('code')}>Liquid code</button>
      </div>

      {tab === 'preview'
        ? <Preview parsed={parsed} image={image} imageError={imageError} loadingImage={loadingImage} />
        : <CodePanel />}

      <div className="settings-section" style={{ marginTop: 20 }}>
        <h3 className="settings-section-title">Blocked on</h3>
        <div className="settings-row"><div className="settings-label">Shopify token for this app, to actually write metafields once we're ready to go live (image lookup above doesn't need it — that's public storefront data)</div></div>
      </div>
    </div>
  )
}

function Preview({ parsed, image, imageError, loadingImage }) {
  const hasContent = parsed.title || parsed.intro || parsed.faqs.length > 0
  return (
    <div className="settings-section" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ background: '#f6f4ef', color: '#222', fontFamily: '"Open Sans Condensed","Arial Narrow",sans-serif' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.2rem 1.5rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#005F2C', marginBottom: 8 }}>
            {parsed.handle || 'paste-a-doc-above'}
          </div>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 700, margin: 0 }}>
            {parsed.title || 'Title will appear here once parsed'}
          </h1>
          <p style={{ marginTop: 12, color: '#555', maxWidth: '62ch' }}>
            {parsed.intro || 'Paste a doc and hit Parse & preview — the intro copy from "Header & Footer Text" renders here.'}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {['Hand-graded', 'Guarantee included', 'Free UK delivery £150+'].map(t => (
              <span key={t} style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', background: '#fff', border: '1px solid #e3e0d6', borderLeft: '3px dashed #20842e', padding: '0.4rem 0.7rem', borderRadius: 3 }}>{t}</span>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem 1.5rem' }}>
          <div style={{ background: '#fff', border: '1px solid #e3e0d6', borderRadius: 6, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
            {loadingImage && <span style={{ fontSize: 13, color: '#888' }}>Fetching real image from the live store…</span>}
            {!loadingImage && image?.image && (
              <>
                <img src={image.image} alt={image.productTitle} style={{ width: 90, height: 90, objectFit: 'contain', background: '#fafafa', borderRadius: 4 }} />
                <div>
                  <div style={{ fontSize: 12.5, color: '#888' }}>Real image, pulled live for handle <code>{parsed.handle}</code></div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{image.productTitle}</div>
                </div>
              </>
            )}
            {!loadingImage && !image?.image && (
              <span style={{ fontSize: 13, color: imageError ? '#c0392b' : '#aaa' }}>
                {imageError || 'Fast Simon grid renders here — no image lookup needed until a doc is parsed.'}
              </span>
            )}
          </div>
        </div>

        <div style={{ background: '#fff', borderTop: '1px solid #e3e0d6', padding: '2rem 1.5rem' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.3rem', marginBottom: 12 }}>
              {hasContent ? `Questions about ${parsed.title || 'this collection'}` : 'FAQs will appear here once parsed'}
            </h2>
            {parsed.faqs.map(({ q, a }) => (
              <details key={q} style={{ borderBottom: '1px solid #e3e0d6', padding: '0.8rem 0' }}>
                <summary style={{ fontWeight: 700, color: '#b5651d', textTransform: 'uppercase', cursor: 'pointer' }}>{q}</summary>
                <p style={{ color: '#666', marginTop: 8, maxWidth: '68ch' }}>{a}</p>
              </details>
            ))}
          </div>
        </div>

        <div style={{ padding: '1rem 1.5rem', fontSize: '0.78rem', color: '#888' }}>
          Page title: {parsed.pageTitle || '—'} &nbsp;|&nbsp; Meta description: {parsed.metaDescription || '—'}
        </div>
      </div>
    </div>
  )
}

const LIQUID_TEMPLATE = `{% comment %}
  sections/model-collection-seo.liquid
  Assign via an alternate collection template (e.g. templates/collection.model-page.json)
  applied to all 380 model collections via template_suffix. Content is per-collection,
  driven entirely by metafields — this file is written ONCE and never touched again.
  Metafields expected (namespace: custom):
    custom.seo_intro        (multi_line_text_field)
    custom.seo_faqs         (json — [[question, answer], ...])
{% endcomment %}

<div class="model-seo">
  <div class="model-seo__container">
    <h1>{{ collection.title }}</h1>
    {% if collection.metafields.custom.seo_intro %}
      <p class="model-seo__intro">{{ collection.metafields.custom.seo_intro.value }}</p>
    {% endif %}
    <div class="model-seo__trust">
      <span>Hand-graded</span><span>Guarantee included</span><span>Free UK delivery £150+</span>
    </div>
  </div>
</div>

{{ collection.description }}
{%- comment -%} Fast Simon grid renders here via the existing collection template {%- endcomment -%}

{% if collection.metafields.custom.seo_faqs %}
  <div class="model-seo model-seo--faq">
    <div class="model-seo__container">
      <h2>Questions about {{ collection.title }}</h2>
      {% assign faqs = collection.metafields.custom.seo_faqs.value %}
      {% for pair in faqs %}
        <details class="model-seo__faq">
          <summary>{{ pair[0] }}</summary>
          <p>{{ pair[1] }}</p>
        </details>
      {% endfor %}
    </div>
  </div>
{% endif %}
`

function CodePanel() {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">sections/model-collection-seo.liquid</h3>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
        Paste into Edit code &rarr; Sections. Reads two metafields per collection (intro text, FAQ list) so the same file serves all 380 without editing it again.
      </p>
      <pre style={{ background: '#0d1410', color: '#d7ecd9', padding: 16, borderRadius: 8, fontSize: 12.5, overflowX: 'auto', lineHeight: 1.6 }}>
        {LIQUID_TEMPLATE}
      </pre>
    </div>
  )
}
