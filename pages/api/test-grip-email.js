import { run } from '../../lib/grip-email-report.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    await run()
    res.json({ ok: true, message: 'Grip email sent — check your inbox' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
