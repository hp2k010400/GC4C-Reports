import { shopifyGraphQL } from '../../../lib/shopify.js'

// Uses the EXISTING header/footer split already built into the live collection
// template — two sections already render:
//   {{ collection.description | split: '<!--footer-text-->' | first }}  (above the grid)
//   {{ collection.description | split: '<!--footer-text-->' | last }}   (below the grid)
// So this needs no new theme section, no template_suffix, and touches nothing
// else on the page (grid, filters, breadcrumbs, alerts all stay exactly as-is).
// It only ever writes to description + title — both easy to restore on revert.

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Real GC4C brand values (pulled from the theme's own scheme editor + Google
// Fonts settings, not invented) — <style> tags get stripped on save, so every
// bit of this has to survive as inline style="" only. Confirmed that does
// survive intact.
const BRAND = {
  cream: '#f6f4ef',
  deepGreen: '#005f2c',
  green: '#20842e',
  faqAccent: '#b5651d',
  border: '#e3e0d6',
  text: '#222222',
  muted: '#555555',
}

function buildDescriptionHtml({ title, intro, faqs }) {
  const introHtml = `
    <div style="background:${BRAND.cream};border-left:4px solid ${BRAND.green};border-radius:6px;padding:1.25rem 1.5rem;max-width:68ch;margin:0 auto;text-align:left;">
      <span style="display:block;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.deepGreen};margin-bottom:0.5rem;">About this collection</span>
      <p style="color:${BRAND.muted};font-size:1.05rem;line-height:1.6;margin:0;">${escapeHtml(intro)}</p>
    </div>`

  const faqItems = (faqs || []).map(([q, a]) => `
        <details style="border-bottom:1px solid ${BRAND.border};padding:0.9rem 0;">
          <summary style="font-weight:700;color:${BRAND.faqAccent};text-transform:uppercase;font-size:0.92rem;cursor:pointer;">${escapeHtml(q)}</summary>
          <p style="color:${BRAND.muted};margin:0.5rem 0 0;font-size:0.95rem;">${escapeHtml(a)}</p>
        </details>`).join('')

  const footerHtml = faqItems
    ? `
    <div style="background:${BRAND.cream};border-radius:6px;padding:1.5rem 1.75rem;max-width:68ch;margin:2rem auto 0;text-align:left;">
      <h2 style="font-size:1.35rem;margin:0 0 1rem;color:${BRAND.text};">Questions about ${escapeHtml(title)}</h2>
      ${faqItems}
    </div>`
    : ''

  return `${introHtml}\n<!--footer-text-->\n${footerHtml}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle, title, intro, faqs, pageTitle, metaDescription } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    // 1. Find the collection and grab its CURRENT content so revert can restore it exactly
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

    // 2. Write the new title + description — the only fields this touches.
    const newDescriptionHtml = buildDescriptionHtml({ title, intro, faqs })
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
