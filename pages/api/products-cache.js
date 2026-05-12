import { getStore } from '@netlify/blobs'

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}

const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

export default async function handler(req, res) {
  let store
  try {
    store = getStore('gc4c-products')
  } catch {
    return res.status(200).json({ hit: false, reason: 'blobs-unavailable' })
  }

  if (req.method === 'GET') {
    const { meta, chunk } = req.query

    if (meta) {
      try {
        const m = await store.get('meta', { type: 'json' })
        if (!m) return res.status(200).json({ hit: false })
        const age = Date.now() - m.timestamp
        if (age > CACHE_TTL_MS) return res.status(200).json({ hit: false })
        return res.status(200).json({ hit: true, totalChunks: m.totalChunks, count: m.count, timestamp: m.timestamp })
      } catch {
        return res.status(200).json({ hit: false })
      }
    }

    if (chunk !== undefined) {
      try {
        const data = await store.get(`chunk-${chunk}`, { type: 'json' })
        return res.status(200).json(data || { rows: [] })
      } catch {
        return res.status(200).json({ rows: [] })
      }
    }

    return res.status(400).json({ error: 'Missing meta or chunk param' })
  }

  if (req.method === 'POST') {
    const { type, chunk, rows, totalChunks, count } = req.body

    try {
      if (type === 'meta') {
        await store.set('meta', JSON.stringify({ totalChunks, count, timestamp: Date.now() }))
      } else if (type === 'chunk') {
        await store.set(`chunk-${chunk}`, JSON.stringify({ rows }))
      }
      return res.status(200).json({ ok: true })
    } catch (err) {
      // Cache write failure is non-fatal — just log and continue
      return res.status(200).json({ ok: false, reason: err.message })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end()
}
