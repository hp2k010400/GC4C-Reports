import { schedule } from '@netlify/functions'
import { run } from '../../lib/pos-email-report.js'

export const handler = schedule('0 18 * * *', async () => {
  try {
    await run()
    return { statusCode: 200 }
  } catch (err) {
    console.error('Daily POS email failed:', err)
    return { statusCode: 500, body: err.message }
  }
})
