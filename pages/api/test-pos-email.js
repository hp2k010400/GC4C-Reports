import { run, runCustomRange } from '../../lib/pos-email-report.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const recipient = req.query.solo === '1' ? 'harry.phillips@golfclubs4cash.co.uk' : undefined
    const { from, to } = req.query

    if (from && to) {
      await runCustomRange(from, to, { testRecipient: recipient })
      res.json({ ok: true, message: `POS email sent for ${from} to ${to}${recipient ? ' (to you only)' : ''}` })
    } else {
      await run({ testRecipient: recipient })
      res.json({ ok: true, message: recipient ? 'POS email sent to you only' : 'POS email sent to all recipients' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
