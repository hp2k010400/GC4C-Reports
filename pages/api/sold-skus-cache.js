import { getStore } from '@netlify/blobs'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const KEY = 'sold-skus'

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
}

export default async function handler(req, res) {
  let store
  try {
    store = getStore('gc4c-sold-skus')
  } catch {
    return res.status(200).json({ hit: false, reason: 'blobs-unavailable' })
  }

  if (req.method === 'GET') {
    try {
      const data = await store.get(KEY, { type: 'json' })
      if (!data) return res.status(200).json({ hit: false })
      const age = Date.now() - data.timestamp
      if (age > CACHE_TTL_MS) return res.status(200).json({ hit: false })
      return res.status(200).json({ hit: true, skus: data.skus, timestamp: data.timestamp })
    } catch {
      return res.status(200).json({ hit: false })
    }
  }

  if (req.method === 'POST') {
    try {
      const { skus } = req.body
      await store.set(KEY, JSON.stringify({ skus, timestamp: Date.now() }))
      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(200).json({ ok: false, reason: err.message })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end()
}
