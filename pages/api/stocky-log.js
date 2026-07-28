import { getStore } from '@netlify/blobs'

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
}

export default async function handler(req, res) {
  const store = getStore({ name: 'gc4c-stocky', consistency: 'strong' })

  if (req.method === 'GET') {
    try {
      const meta = await store.get('meta', { type: 'json' })
      if (!meta) return res.status(200).json({ rows: [], updatedAt: null })

      const chunks = await Promise.all(
        Array.from({ length: meta.totalChunks }, (_, i) => store.get(`chunk-${i}`, { type: 'json' }))
      )
      const rows = chunks.flatMap(c => c?.rows || [])
      return res.status(200).json({ rows, updatedAt: meta.updatedAt })
    } catch {
      return res.status(200).json({ rows: [], updatedAt: null })
    }
  }

  if (req.method === 'POST') {
    const { password, type, chunk, rows, totalChunks, count } = req.body || {}
    if (!password || password !== process.env.SETTINGS_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Uploaded in chunks — a single request with the whole spreadsheet as
    // JSON can exceed Netlify's function payload limit on a large file
    // (JSON repeats every column name per row, so it's much bigger than
    // the original CSV).
    if (type === 'chunk') {
      if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' })
      await store.set(`chunk-${chunk}`, JSON.stringify({ rows }))
      return res.status(200).json({ ok: true })
    }

    if (type === 'meta') {
      await store.set('meta', JSON.stringify({ totalChunks, count, updatedAt: new Date().toISOString() }))
      return res.status(200).json({ ok: true, count })
    }

    return res.status(400).json({ error: 'type must be "chunk" or "meta"' })
  }

  res.status(405).end()
}
