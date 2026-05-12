import { getStore } from '@netlify/blobs'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const monthKey = req.query.month || new Date().toISOString().slice(0, 7)

  try {
    const store = getStore('gc4c-adjustments')
    const data = await store.get(monthKey, { type: 'json' }).catch(() => null)
    const entries = Array.isArray(data) ? [...data].reverse() : []
    res.status(200).json({ entries })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
