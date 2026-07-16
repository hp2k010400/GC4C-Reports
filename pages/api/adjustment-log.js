import { getStore } from '@netlify/blobs'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const monthKey = req.query.month || new Date().toISOString().slice(0, 7)
    try {
      const store = getStore('gc4c-adjustments')
      const data = await store.get(monthKey, { type: 'json' }).catch(() => null)
      const entries = Array.isArray(data) ? [...data].reverse() : []
      return res.status(200).json({ entries })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // TEMPORARY one-off migration: rewrite stale reason text left over from a
  // frontend bug (fixed in aff3098) where "Damaged" could get submitted after
  // being renamed to "Written off - Damaged". Remove this method once run.
  if (req.method === 'POST') {
    const { month, from, to } = req.body || {}
    if (!month || !from || !to) return res.status(400).json({ error: 'month, from, to required' })
    try {
      const store = getStore({ name: 'gc4c-adjustments', consistency: 'strong' })
      const data = await store.get(month, { type: 'json' }).catch(() => null)
      if (!Array.isArray(data)) return res.status(200).json({ ok: true, updated: 0 })
      let updated = 0
      const next = data.map(e => {
        if (e.reason === from) { updated++; return { ...e, reason: to } }
        return e
      })
      await store.set(month, JSON.stringify(next))
      return res.status(200).json({ ok: true, updated })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  res.status(405).end()
}
