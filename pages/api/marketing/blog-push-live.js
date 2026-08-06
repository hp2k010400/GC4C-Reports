import { shopifyGraphQL } from '../../../lib/shopify.js'
import { resolveProductImage } from '../../../lib/marketing-products.js'
import { checkPushGuard } from '../../../lib/marketing-safety.js'

const TEMPLATE_SUFFIX = 'brand-blog'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const {
    blogHandle, handle, confirmHandle, title, pageTitle, metaDescription, excerpt,
    tags, h1, introParagraphs, sections, featuredImageHint,
  } = req.body
  if (!blogHandle || !handle) return res.status(400).json({ error: 'blogHandle and handle are required' })

  const guardError = checkPushGuard(handle, confirmHandle)
  if (guardError) return res.status(400).json({ error: guardError })

  try {
    const blogData = await shopifyGraphQL(`
      query($q: String!) { blogs(first: 1, query: $q) { nodes { id } } }
    `, { q: `handle:${blogHandle}` })
    const blogId = blogData.blogs.nodes[0]?.id
    if (!blogId) throw new Error(`No blog found for handle "${blogHandle}"`)

    return res.status(200).json({ ok: true, blogId, TEMPLATE_SUFFIX, resolveProductImage: typeof resolveProductImage })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
