import { shopifyGraphQL } from '../../../lib/shopify.js'

// This is the REAL version: writes to metafields + assigns the shared
// "model-page" template (built once, reused for all 380). The section
// files live in the theme already — this route never touches theme code,
// only per-collection data, which is what makes it safe to run repeatedly.
const TEMPLATE_SUFFIX = 'model-page'

// Verified real, live collection handles — same ones confirmed to resolve
// before wiring them in as links.
const BRAND_INFO = {
  'Callaway Drivers': { model: 'Qi10 / Qi35', href: '/collections/callaway-drivers' },
  'Ping Drivers': { model: 'Qi10 Max', href: '/collections/ping-drivers' },
  'Titleist Drivers': { model: 'Qi10 LS / Qi4D', href: '/collections/titleist-drivers' },
  'Cobra Drivers': { model: 'M-Series', href: '/collections/cobra-drivers' },
}

function isNote(line) {
  return /^\(.*\)$/.test(line.trim())
}

// Turns the raw "Other Clubs or Brands" doc text into structured rows the
// model-collection-details section can render as a real comparison table.
function parseCompareBrands(text) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(l => l && !isNote(l))
  const rows = []
  for (const line of lines) {
    const clean = line.replace(/^\*\s*/, '')
    const dashIdx = clean.indexOf('—')
    if (dashIdx > 0 && dashIdx < 40) {
      const brand = clean.slice(0, dashIdx).trim()
      const why = clean.slice(dashIdx + 1).trim()
      const info = BRAND_INFO[brand]
      if (info) rows.push({ brand, model: info.model, why, href: info.href })
    }
  }
  return rows
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle, faqs, otherBrands, guides, intro } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    const found = await shopifyGraphQL(`
      query($handle: String!) {
        collectionByHandle(handle: $handle) {
          id
          templateSuffix
          metafields(identifiers: [
            {namespace: "custom", key: "seo_intro"},
            {namespace: "custom", key: "seo_faqs"},
            {namespace: "custom", key: "seo_compare_brands"},
            {namespace: "custom", key: "seo_guides_url"}
          ]) { key value }
        }
      }
    `, { handle })
    const collection = found.collectionByHandle
    if (!collection) throw new Error(`No collection found for handle "${handle}"`)

    const original = {
      templateSuffix: collection.templateSuffix || '',
      metafields: Object.fromEntries((collection.metafields || []).filter(Boolean).map(m => [m.key, m.value])),
    }

    const guidesUrlMatch = (guides || '').match(/https?:\/\/\S+/)
    const compareBrands = parseCompareBrands(otherBrands)

    const update = await shopifyGraphQL(`
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id handle templateSuffix }
          userErrors { field message }
        }
      }
    `, {
      input: {
        id: collection.id,
        templateSuffix: TEMPLATE_SUFFIX,
        metafields: [
          { namespace: 'custom', key: 'seo_intro', type: 'multi_line_text_field', value: intro || '' },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: JSON.stringify(faqs || []) },
          { namespace: 'custom', key: 'seo_compare_brands', type: 'json', value: JSON.stringify(compareBrands) },
          { namespace: 'custom', key: 'seo_guides_url', type: 'single_line_text_field', value: guidesUrlMatch ? guidesUrlMatch[0] : '' },
        ],
      },
    })

    const errors = update.collectionUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true, original, compareBrands })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
