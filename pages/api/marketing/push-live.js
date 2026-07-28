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

// Shopify's descriptionHtml sanitizer strips <style> tags and most class
// attributes on save, even though the API call itself reports success — so
// every bit of visual treatment here has to survive as inline style="" only.
function buildDescriptionHtml({ title, intro, faqs }) {
  const introHtml = `
    <p style="color:#555555;max-width:62ch;margin:0 auto;font-size:1.05rem;line-height:1.6;text-align:left;">${escapeHtml(intro)}</p>`

  const faqItems = (faqs || []).map(([q, a]) => `
        <details style="border-bottom:1px solid #e3e0d6;padding:0.9rem 0;">
          <summary style="font-weight:700;color:#b5651d;text-transform:uppercase;cursor:pointer;">${escapeHtml(q)}</summary>
          <p style="color:#666666;margin-top:0.6rem;max-width:68ch;">${escapeHtml(a)}</p>
        </details>`).join('')

  const footerHtml = faqItems
    ? `
    <div style="border-top:1px solid #e3e0d6;margin-top:2rem;padding-top:1.5rem;text-align:left;max-width:68ch;margin-left:auto;margin-right:auto;">
      <h2 style="font-size:1.4rem;margin-bottom:1rem;">Questions about ${escapeHtml(title)}</h2>
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
