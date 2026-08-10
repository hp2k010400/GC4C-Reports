/**
 * One-shot endpoint to inject GC4C brand CSS into the live Shopify theme.
 * Creates snippets/gc4c-brand-css.liquid and renders it from layout/theme.liquid.
 * Call once: GET /api/apply-theme-css?secret=<ACTION_SECRET>
 * Add ?dry=1 to preview without saving.
 */

const STORE = process.env.SHOPIFY_STORE
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const API   = '2025-04'

const MARKER = 'gc4c-brand-css'

const BRAND_CSS_SNIPPET = `{%- comment -%}
  GC4C Brand CSS — injected 2026-08
  Typography, product cards, blog cards, Fast Simon
{%- endcomment -%}
<style>
/* ── TYPOGRAPHY ─────────────────────────────────────────── */
h1, .h1 {
  font-size: 34px;
  line-height: 50px;
  font-weight: 400;
}
body, p, li, td, span {
  font-size: 20px;
  line-height: 32px;
}
.m-page-width {
  max-width: 1600px !important;
}

/* ── PRODUCT CARDS (Homepage Tabs, Collections, CLP) ───── */
.m-product-card {
  background: #fff;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  transition: 0.3s ease;
  padding-bottom: 15px;
}
.m-product-card:hover {
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  transform: translateY(-5px) scale(1.02);
}
.m-product-card__title,
.m-product-card__name {
  padding: 0 15px !important;
  min-height: 80px;
  max-height: 100px;
  font-size: 16px;
}
.m-product-card__price {
  padding-bottom: 0 !important;
}
.m-price-item {
  font-size: 24px;
  font-weight: 700;
  color: #005f2c;
}

/* ── BLOG CARDS (Brand Hub, Blog CLP) ───────────────────── */
.m-article-card {
  background-color: #ffffff;
  padding: 10px;
  min-height: 480px;
  max-height: 530px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
}
.m-article-card__content {
  min-height: 30px;
}
.m-article-card__title {
  min-height: 60px;
  max-height: 100px;
}
.m-article-card__excerpt {
  min-height: 100px;
  max-height: 200px;
}

/* ── FAST SIMON (Search & Collection Results) ───────────── */
.product-card-items-wrapper {
  background-color: #ffffff;
  border: 1px solid #e1e1e1;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  margin-bottom: 30px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.product-card-items-wrapper:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
}
</style>`

async function shopifyFetch(method, path, body = null) {
  const res = await fetch(`https://${STORE}/admin/api/${API}/${path}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Shopify ${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const dry = req.query.dry === '1'

  try {
    // 1. Find the live (main) theme
    const { themes } = await shopifyFetch('GET', 'themes.json')
    const live = themes.find(t => t.role === 'main')
    if (!live) return res.status(404).json({ error: 'No live theme found' })

    // 2. Read theme.liquid
    const layoutAsset = await shopifyFetch('GET', `themes/${live.id}/assets.json?asset[key]=layout/theme.liquid`)
    const themeLiquid = layoutAsset.asset?.value || ''
    if (!themeLiquid) return res.status(500).json({ error: 'Could not read layout/theme.liquid' })

    // 3. Check if already injected (idempotent)
    if (themeLiquid.includes(MARKER)) {
      return res.json({
        ok: true,
        message: 'Brand CSS already injected — no changes made',
        theme: live.name,
      })
    }

    // 4. Inject render tag just before </head>
    const renderTag = `  {%- render '${MARKER}' -%}\n`
    if (!themeLiquid.includes('</head>')) {
      return res.status(500).json({ error: 'Could not find </head> in theme.liquid' })
    }
    const updatedLiquid = themeLiquid.replace('</head>', renderTag + '</head>')

    if (dry) {
      return res.json({
        ok: true,
        dry: true,
        theme: live.name,
        themeId: live.id,
        snippetKey: `snippets/${MARKER}.liquid`,
        renderTag,
        themeLiquidPreview: updatedLiquid.slice(updatedLiquid.indexOf(renderTag) - 100, updatedLiquid.indexOf(renderTag) + 200),
      })
    }

    // 5. Create the snippet
    await shopifyFetch('PUT', `themes/${live.id}/assets.json`, {
      asset: {
        key: `snippets/${MARKER}.liquid`,
        value: BRAND_CSS_SNIPPET,
      },
    })

    // 6. Update theme.liquid to render the snippet
    await shopifyFetch('PUT', `themes/${live.id}/assets.json`, {
      asset: {
        key: 'layout/theme.liquid',
        value: updatedLiquid,
      },
    })

    return res.json({
      ok: true,
      message: `Brand CSS injected into theme "${live.name}" (ID ${live.id})`,
      snippetCreated: `snippets/${MARKER}.liquid`,
      renderTagAdded: renderTag.trim(),
    })
  } catch (err) {
    console.error('apply-theme-css error:', err)
    return res.status(500).json({ error: err.message })
  }
}
