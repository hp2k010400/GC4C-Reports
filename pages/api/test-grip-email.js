import { run } from '../../lib/grip-email-report.js'

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ACTION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const recipient = req.query.solo === '1' ? 'harry.phillips@golfclubs4cash.co.uk' : undefined
    await run({ testRecipient: recipient })
    res.json({ ok: true, message: recipient ? 'Grip email sent to you only' : 'Grip email sent to all recipients' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
