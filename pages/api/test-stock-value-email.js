import { run } from '../../lib/reports/stock-value-email-report.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const recipient = req.query.to || (req.query.solo === '1' ? 'harry.phillips@golfclubs4cash.co.uk' : undefined)
    const result = await run({ testRecipient: recipient })
    res.json({ ok: true, message: recipient ? 'Stock Value email sent to you only' : 'Stock Value email sent to all recipients', ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
