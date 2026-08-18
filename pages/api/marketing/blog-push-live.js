import { shopifyGraphQL } from '../../../lib/shopify.js'
import { resolveProductImage } from '../../../lib/marketing-products.js'
import { buildBlogBodyHtml } from '../../../lib/marketing-blog-html.js'
import { autoLinkBrandMentions } from '../../../lib/marketing-brand-links.js'

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
    tags, h1, subtitle, heroImage, featuredImage, introParagraphs, sections, sources, featuredImageHint,
    skipAutoImages,
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
            mf_title_tag: metafield(namespace: "global", key: "title_tag") { value }
          }
        }
      }
    `, { q: `handle:${handle}` })
    const existing = found.articles.nodes[0]

    // Auto-resolve a real product photo per section — but only when the
    // section didn't already bring its own explicit image (e.g. a real
    // infographic uploaded from the source doc), and only when the caller
    // hasn't opted out entirely via skipAutoImages (e.g. a data-journalism
    // piece where NONE of the content is "about" a product — searching
    // Shopify by a heading like "Scotland" surfaced a Scotland-flag towel).
    // This mirrors the equivalent skip already applied in the frontend
    // preview — this route has its own separate resolution and needs the
    // same flag, or a push can go live with the old wrong-product images
    // even though the preview looked correct.
    const sectionImages = skipAutoImages
      ? (sections || []).map(s => s.image || null)
      : await Promise.all((sections || []).map(s => (s.image ? Promise.resolve(s.image) : resolveProductImage(s.heading))))
    const featuredImageUrl = (!skipAutoImages && featuredImageHint) ? await resolveProductImage(featuredImageHint) : null

    // Some docs have real hyperlinks already embedded in the body text
    // (woven in upstream from the doc's own HTML export). Others instead
    // carry an explicit instruction with no inline links of their own at
    // all ("Link to any product specific models or any mention of brands
    // etc, search results if n/a") — the linking is meant to happen at
    // page-build time. This covers that case unconditionally: it only
    // ever ADDS a link to a real brand mention that has none yet (it skips
    // anything already inside a real <a> tag), so it's safe to run on
    // every push, not just ones that ask for it by name.
    const brandLinkState = [new Set(), new Map()]
    const linkedIntro = await autoLinkBrandMentions(introParagraphs || [], ...brandLinkState)
    const linkedSections = []
    for (const s of (sections || [])) {
      linkedSections.push({ ...s, paragraphs: await autoLinkBrandMentions(s.paragraphs || [], ...brandLinkState) })
    }

    // article.image drives the theme's OWN native full-width feature-image
    // block at the top of the article (sections/article.liquid, both design
    // options) — it renders at the image's *native* aspect ratio stretched
    // to full page width, with no crop. A ~4:3 photo (featuredImage) at
    // full viewport width comes out enormous and square-ish; a wide ~4:1
    // banner (heroImage) renders as the correct slim banner. So heroImage
    // now drives article.image, and the body no longer renders its own
    // separate .gc4c-hero — the native slot IS the hero, one image, not two.
    const bodyHtml = buildBlogBodyHtml({
      subtitle, introParagraphs: linkedIntro, sources,
      sections: linkedSections.map((s, i) => ({ ...s, image: sectionImages[i] || null })),
    })
    // article.title drives BOTH the visible on-page H1 and the browser
    // tab/<title> by default, with no separate field for each — a doc that
    // deliberately gives a short on-page H1 ("The Final Round") and a
    // longer, keyword-heavy SEO title as two different fields would
    // otherwise show the SEO title as the page heading. The global.title_tag
    // metafield (same pattern as description_tag) decouples them: article
    // title stays the real H1, title_tag carries the SEO-optimised one.
    const articleInput = {
      title: h1 || title,
      body: bodyHtml,
      summary: excerpt || subtitle || '',
      tags: (tags || []),
      templateSuffix: TEMPLATE_SUFFIX,
      metafields: [
        { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: metaDescription || '' },
        { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: title || h1 || '' },
      ],
      // See note above the buildBlogBodyHtml call — heroImage is what the
      // theme's native full-width feature-image block actually needs
      // (renders at native aspect ratio, so a wide banner is correct; a
      // normal ~3:2 photo blows up to an oversized square there). Falls
      // back to featuredImage for docs with no wide banner at all. Explicit
      // null clears any image left over from an earlier push when neither
      // is given.
      image: (heroImage || featuredImage) ? { url: heroImage || featuredImage } : null,
      // Was only being set on create, never on update — an article that
      // happened to already be unpublished (e.g. a stale test article from
      // before this field existed) would silently stay unpublished on every
      // future push, reporting success while 404ing live with no way to
      // tell short of checking Shopify directly. "Push Live" should always
      // mean live.
      isPublished: true,
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
        title_tag: existing.mf_title_tag?.value || '',
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
