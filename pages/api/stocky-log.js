import { getStore } from '@netlify/blobs'

const STORE_KEY = 'rows'

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
}

export default async function handler(req, res) {
  const store = getStore({ name: 'gc4c-stocky', consistency: 'strong' })

  if (req.method === 'GET') {
    try {
      const data = await store.get(STORE_KEY, { type: 'json' })
      return res.status(200).json({ rows: data?.rows || [], updatedAt: data?.updatedAt || null })
    } catch {
      return res.status(200).json({ rows: [], updatedAt: null })
    }
  }

  if (req.method === 'POST') {
    const { password, rows } = req.body || {}
    if (!password || password !== process.env.SETTINGS_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows array required' })

    await store.set(STORE_KEY, JSON.stringify({ rows, updatedAt: new Date().toISOString() }))
    return res.status(200).json({ ok: true, count: rows.length })
  }

  res.status(405).end()
}
