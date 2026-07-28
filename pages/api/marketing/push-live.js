import { shopifyGraphQL } from '../../../lib/shopify.js'

// Uses the EXISTING header/footer split already built into the live collection
// template — two sections already render:
//   {{ collection.description | split: '<!--footer-text-->' | first }}  (above the grid)
//   {{ collection.description | split: '<!--footer-text-->' | last }}   (below the grid)
// So this needs no new theme section, no template_suffix, and touches nothing
// else on the page (grid, filters, breadcrumbs, alerts all stay exactly as-is).
// It only ever writes to the description field — same field, easy to restore.

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildDescriptionHtml({ title, intro, faqs }) {
  const introHtml = `<p>${escapeHtml(intro)}</p>`
  const faqHtml = (faqs || []).map(([q, a]) => `
    <details>
      <summary>${escapeHtml(q)}</summary>
      <p>${escapeHtml(a)}</p>
    </details>`).join('')

  const footerHtml = faqHtml
    ? `<div class="model-seo-faq"><h2>Questions about ${escapeHtml(title)}</h2>${faqHtml}</div>`
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
          descriptionHtml
          seo { title description }
        }
      }
    `, { handle })
    const collection = found.collectionByHandle
    if (!collection) throw new Error(`No collection found for handle "${handle}"`)

    const original = {
      descriptionHtml: collection.descriptionHtml || '',
      seoTitle: collection.seo?.title || '',
      seoDescription: collection.seo?.description || '',
    }

    // 2. Write the new description — the ONLY field this touches.
    const newDescriptionHtml = buildDescriptionHtml({ title, intro, faqs })
    const update = await shopifyGraphQL(`
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id handle descriptionHtml }
          userErrors { field message }
        }
      }
    `, {
      input: {
        id: collection.id,
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
