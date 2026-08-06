import { shopifyGraphQL } from '../../../lib/shopify.js'
import { resolveProductImage } from '../../../lib/marketing-products.js'
import { buildBlogBodyHtml } from '../../../lib/marketing-blog-html.js'

// Writes directly to the article's native fields (title, body, summary,
// tags, image) rather than metafields + a custom section — the theme's own
// stock "article" section already renders article.content inside a styled
// .rte wrapper, so plain semantic HTML (h2/p/img) picks up the theme's
// typography for free. Per-section product images are resolved here (real
// Shopify product photos, matched by the section heading) since Liquid
// can't make outbound calls.
const TEMPLATE_SUFFIX = 'brand-blog'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'SHOPIFY_ACCESS_TOKEN not configured on this environment' })
  }

  const {
    blogHandle, handle, title, pageTitle, metaDescription, excerpt,
    tags, h1, introParagraphs, sections, featuredImageHint,
  } = req.body
  if (!blogHandle || !handle) return res.status(400).json({ error: 'blogHandle and handle are required' })

  try {
    const blogData = await shopifyGraphQL(`
      query($q: String!) { blogs(first: 1, query: $q) { nodes { id } } }
    `, { q: `handle:${blogHandle}` })
    const blogId = blogData.blogs.nodes[0]?.id
    if (!blogId) throw new Error(`No blog found for handle "${blogHandle}" — create the blog in Shopify first (this tool only creates/updates articles, not blogs).`)

    const found = await shopifyGraphQL(`
      query($q: String!) {
        articles(first: 1, query: $q) {
          nodes {
            id title body summary tags templateSuffix
            image { url altText }
            mf_description: metafield(namespace: "global", key: "description_tag") { value }
          }
        }
      }
    `, { q: `handle:${handle}` })
    const existing = found.articles.nodes[0]

    // Resolve real product photos for each section, and the featured image, in parallel.
    const [sectionImages, featuredImageUrl] = await Promise.all([
      Promise.all((sections || []).map(s => resolveProductImage(s.heading))),
      featuredImageHint ? resolveProductImage(featuredImageHint) : Promise.resolve(null),
    ])

    const bodyHtml = buildBlogBodyHtml({
      introParagraphs,
      sections: (sections || []).map((s, i) => ({ ...s, image: sectionImages[i] || null })),
    })

    // Deliberately not setting article.image: the theme's stock article
    // section ties "has a featured image" directly to "show it as a giant
    // full-width hero" with no way to decouple the two using its own
    // settings — Harry didn't want the hero. Real product photos already
    // live inside the body content itself for visual interest.
    const articleInput = {
      title: title || h1,
      body: bodyHtml,
      summary: excerpt || '',
      tags: (tags || []),
      templateSuffix: TEMPLATE_SUFFIX,
      metafields: [
        { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: metaDescription || '' },
      ],
      // Explicit null clears any image left over from an earlier push
      // (before this fix) — omitting the field would just leave it as is.
      image: null,
    }

    let article
    let original = null
    if (existing) {
      original = {
        title: existing.title,
        body: existing.body,
        summary: existing.summary,
        tags: existing.tags,
        templateSuffix: existing.templateSuffix || '',
        image: existing.image ? { url: existing.image.url, altText: existing.image.altText || '' } : null,
        description_tag: existing.mf_description?.value || '',
      }
      const update = await shopifyGraphQL(`
        mutation($id: ID!, $article: ArticleUpdateInput!) {
          articleUpdate(id: $id, article: $article) {
            article { id handle }
            userErrors { field message }
          }
        }
      `, { id: existing.id, article: articleInput })
      const errors = update.articleUpdate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      article = update.articleUpdate.article
    } else {
      const create = await shopifyGraphQL(`
        mutation($article: ArticleCreateInput!) {
          articleCreate(article: $article) {
            article { id handle }
            userErrors { field message }
          }
        }
      `, {
        article: {
          ...articleInput,
          handle,
          blogId,
          isPublished: true,
          author: { name: 'GolfClubs4Cash' },
        },
      })
      const errors = create.articleCreate.userErrors
      if (errors?.length) throw new Error(errors.map(e => e.message).join('; '))
      article = create.articleCreate.article
    }

    return res.status(200).json({ ok: true, original, created: !existing, sectionImages, featuredImageUrl, articleHandle: article.handle })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
