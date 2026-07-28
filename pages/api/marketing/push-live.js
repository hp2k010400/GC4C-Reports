import { shopifyGraphQL } from '../../../lib/shopify.js'

const SECTION_FILENAME = 'sections/model-collection-seo.liquid'
const TEMPLATE_FILENAME = 'templates/collection.model-page.json'
const TEMPLATE_SUFFIX = 'model-page'

const SECTION_LIQUID = `{% comment %}
  Written once, reused for every model collection — content comes entirely
  from this collection's metafields, never hardcoded here.
{% endcomment %}
<div class="model-seo">
  <div class="model-seo__container">
    <h1>{{ collection.title }}</h1>
    {% if collection.metafields.custom.seo_intro %}
      <p class="model-seo__intro">{{ collection.metafields.custom.seo_intro.value }}</p>
    {% endif %}
  </div>
</div>
{{ collection.description }}
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
<style>
  .model-seo__container { max-width: 900px; margin: 0 auto; padding: 0 1.5rem; }
  .model-seo h1 { font-size: 2rem; }
  .model-seo__intro { color: #555; max-width: 62ch; margin-top: 0.75rem; }
  .model-seo--faq { border-top: 1px solid #e3e0d6; padding: 2rem 0; margin-top: 2rem; }
  .model-seo details { border-bottom: 1px solid #e3e0d6; padding: 0.8rem 0; }
  .model-seo summary { font-weight: 700; color: #b5651d; text-transform: uppercase; cursor: pointer; }
</style>
`

const TEMPLATE_JSON = JSON.stringify({
  sections: {
    main: { type: 'model-collection-seo' },
  },
  order: ['main'],
}, null, 2)

async function getMainThemeId() {
  const res = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2025-04/themes.json`, {
    headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
  })
  const data = await res.json()
  const main = data.themes.find(t => t.role === 'main')
  if (!main) throw new Error('No main theme found')
  return main.id
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2025-04/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`Failed to write ${key}: ${res.status} ${await res.text()}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const { handle, intro, faqs, pageTitle, metaDescription } = req.body
  if (!handle) return res.status(400).json({ error: 'handle is required' })

  try {
    // 1. Find the collection
    const found = await shopifyGraphQL(`
      query($handle: String!) {
        collectionByHandle(handle: $handle) { id }
      }
    `, { handle })
    const collectionId = found.collectionByHandle?.id
    if (!collectionId) throw new Error(`No collection found for handle "${handle}"`)

    // 2. Push section + template into the MAIN theme (inert until step 4)
    const themeId = await getMainThemeId()
    await putAsset(themeId, SECTION_FILENAME, SECTION_LIQUID)
    await putAsset(themeId, TEMPLATE_FILENAME, TEMPLATE_JSON)

    // 3 & 4. Write metafields AND assign the template in one mutation —
    // this is the step that makes it visible on the live page.
    const update = await shopifyGraphQL(`
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id handle templateSuffix }
          userErrors { field message }
        }
      }
    `, {
      input: {
        id: collectionId,
        templateSuffix: TEMPLATE_SUFFIX,
        seo: { title: pageTitle || undefined, description: metaDescription || undefined },
        metafields: [
          { namespace: 'custom', key: 'seo_intro', type: 'multi_line_text_field', value: intro || '' },
          { namespace: 'custom', key: 'seo_faqs', type: 'json', value: JSON.stringify(faqs || []) },
        ],
      },
    })

    const errors = update.collectionUpdate.userErrors
    if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))

    return res.status(200).json({ ok: true, collection: update.collectionUpdate.collection })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
