const STORE = process.env.SHOPIFY_STORE
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const API = '2025-04'

async function shopifyGet(path, params = {}) {
  const url = new URL(`https://${STORE}/admin/api/${API}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  })

  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
  return { data: await res.json(), headers: res.headers }
}

export async function shopifyFetchPage(path, key, params = {}) {
  const { data, headers } = await shopifyGet(path, { ...params, limit: 250 })
  const link = headers.get('link') || ''
  const match = link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/)
  return {
    items: data[key] || [],
    nextPageInfo: match ? match[1] : null,
  }
}
