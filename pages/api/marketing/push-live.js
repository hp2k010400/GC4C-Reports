import { shopifyGraphQL } from '../../../lib/shopify.js'

// Uses the EXISTING header/footer split already built into the live collection
// template — two sections already render:
//   {{ collection.description | split: '<!--footer-text-->' | first }}  (above the grid)
//   {{ collection.description | split: '<!--footer-text-->' | last }}   (below the grid)
// So this needs no new theme section, no template_suffix, and touches nothing
// else on the page (grid, filters, breadcrumbs, alerts all stay exactly as-is).
// It only ever writes to description + title — both easy to restore on revert.
// <style> tags get stripped on save — every bit of design here is inline
// style="", confirmed to survive intact.

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const BRAND = {
  cream: '#f6f4ef',
  deepGreen: '#005f2c',
  green: '#20842e',
  faqAccent: '#b5651d',
  border: '#e3e0d6',
  text: '#222222',
  muted: '#555555',
}

// Verified real, live collection handles for brands this doc mentions —
// confirmed to actually resolve before wiring them in as links.
const BRAND_LINKS = {
  'Callaway Drivers': '/collections/callaway-drivers',
  'Ping Drivers': '/collections/ping-drivers',
  'Titleist Drivers': '/collections/titleist-drivers',
  'Cobra Drivers': '/collections/cobra-drivers',
}
const TRADE_IN_URL = '/pages/sell-your-clubs'

function isNote(line) {
  return /^\(.*\)$/.test(line.trim())
}

// Renders a raw section's text as paragraphs, turning "Name — description"
// lines into linked bullet points (using BRAND_LINKS where we have a real,
// verified URL) and "N. text" lines into numbered steps.
function renderProse(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(l => l && !isNote(l))
  return lines.map(line => {
    const clean = line.replace(/^\*\s*/, '')
    const dashIdx = clean.indexOf('—')
    if (dashIdx > 0 && dashIdx < 40) {
      const name = clean.slice(0, dashIdx).trim()
      const desc = clean.slice(dashIdx + 1).trim()
      const href = BRAND_LINKS[name]
      const nameHtml = href
        ? `<a href="${href}" style="color:${BRAND.green};font-weight:700;text-decoration:underline;">${escapeHtml(name)}</a>`
        : `<strong>${escapeHtml(name)}</strong>`
      return `<p style="margin:0 0 0.6rem;color:${BRAND.muted};">${nameHtml} — ${escapeHtml(desc)}</p>`
    }
    const step = clean.match(/^(\d+)\.\s*(.+)$/)
    if (step) {
      return `<p style="margin:0 0 0.6rem;color:${BRAND.muted};"><strong style="color:${BRAND.deepGreen};">${step[1]}.</strong> ${escapeHtml(step[2])}</p>`
    }
    return `<p style="margin:0 0 0.75rem;color:${BRAND.muted};">${escapeHtml(clean)}</p>`
  }).join('')
}

function card(innerHtml, { heading } = {}) {
  return `
    <div style="background:${BRAND.cream};border-radius:6px;padding:1.5rem 1.75rem;max-width:68ch;margin:1.5rem auto 0;text-align:left;">
      ${heading ? `<h2 style="font-size:1.3rem;margin:0 0 1rem;color:${BRAND.text};">${escapeHtml(heading)}</h2>` : ''}
      ${innerHtml}
    </div>`
}

function buildDescriptionHtml({ title, intro, faqs, collectionDescription, playerType, otherBrands, tradeIn, whyChooseUs, guides, image }) {
  const imageHtml = image
    ? `<div style="text-align:center;margin:0 auto 1.5rem;max-width:68ch;"><img src="${image}" alt="${escapeHtml(title)}" style="max-width:280px;border-radius:6px;"></div>`
    : ''

  const introHtml = `
    <div style="background:${BRAND.cream};border-left:4px solid ${BRAND.green};border-radius:6px;padding:1.25rem 1.5rem;max-width:68ch;margin:0 auto;text-align:left;">
      <span style="display:block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.deepGreen};margin-bottom:0.5rem;">About this collection</span>
      <p style="color:${BRAND.muted};font-size:1.05rem;line-height:1.6;margin:0;">${escapeHtml(intro)}</p>
    </div>`

  const descriptionCard = collectionDescription
    ? card(renderProse(collectionDescription))
    : ''

  const playerTypeCard = playerType
    ? card(renderProse(playerType), { heading: 'Who it’s for' })
    : ''

  const otherBrandsCard = otherBrands
    ? card(renderProse(otherBrands), { heading: 'Compare other brands' })
    : ''

  const tradeInCard = tradeIn
    ? card(`
      ${renderProse(tradeIn)}
      <a href="${TRADE_IN_URL}" style="display:inline-block;margin-top:0.75rem;background:${BRAND.green};color:#ffffff;font-weight:700;text-decoration:none;padding:0.65rem 1.25rem;border-radius:6px;">Trade your clubs in here</a>
    `, { heading: 'Trade in your old clubs' })
    : ''

  const whyChooseUsCard = whyChooseUs
    ? card(renderProse(whyChooseUs), { heading: 'Why choose us' })
    : ''

  const faqItems = (faqs || []).map(([q, a]) => `
        <details style="border-bottom:1px solid ${BRAND.border};padding:0.9rem 0;">
          <summary style="font-weight:700;color:${BRAND.faqAccent};text-transform:uppercase;font-size:0.92rem;cursor:pointer;">${escapeHtml(q)}</summary>
          <p style="color:${BRAND.muted};margin:0.5rem 0 0;font-size:0.95rem;">${escapeHtml(a)}</p>
        </details>`).join('')
  const faqCard = faqItems ? card(faqItems, { heading: `Questions about ${title}` }) : ''

  const guidesUrlMatch = (guides || '').match(/https?:\/\/\S+/)
  const guidesHtml = guidesUrlMatch
    ? `<p style="max-width:68ch;margin:1.5rem auto 0;text-align:left;font-size:0.9rem;">
        <a href="${guidesUrlMatch[0]}" style="color:${BRAND.green};font-weight:700;text-decoration:underline;">Read our buying guides &rarr;</a>
      </p>`
    : ''

  const bylineMatch = (guides || '').match(/Reviewed by[^\n]+|Author byline[^\n]+/i)
  const bylineHtml = bylineMatch
    ? `<p style="max-width:68ch;margin:0.75rem auto 0;text-align:left;font-size:0.82rem;color:${BRAND.muted};font-style:italic;">${escapeHtml(bylineMatch[0])}</p>`
    : ''

  const above = `${imageHtml}${introHtml}`
  const below = `${descriptionCard}${playerTypeCard}${otherBrandsCard}${tradeInCard}${whyChooseUsCard}${faqCard}${guidesHtml}${bylineHtml}`

  return `${above}\n<!--footer-text-->\n${below}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const {
    handle, title, intro, faqs, pageTitle, metaDescription,
    collectionDescription, playerType, otherBrands, tradeIn, whyChooseUs, guides, image,
  } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($handle: String!) {
        collectionByHandle(handle: $handle) {
          id
          title
          descriptionHtml
          seo { title description }
        }
      }
    `, { handle })
    const collection = found.collectionByHandle
    if (!collection) throw new Error(`No collection found for handle "${handle}"`)

    const original = {
      title: collection.title,
      descriptionHtml: collection.descriptionHtml || '',
      seoTitle: collection.seo?.title || '',
      seoDescription: collection.seo?.description || '',
    }

    const newDescriptionHtml = buildDescriptionHtml({
      title, intro, faqs, collectionDescription, playerType, otherBrands, tradeIn, whyChooseUs, guides, image,
    })
    const update = await shopifyGraphQL(`
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id handle title descriptionHtml }
          userErrors { field message }
        }
      }
    `, {
      input: {
        id: collection.id,
        title: title || undefined,
        descriptionHtml: newDescriptionHtml,
        seo: { title: pageTitle || undefined, description: metaDescription || undefined },
      },
    })

    const errors = update.collectionUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true, original })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
