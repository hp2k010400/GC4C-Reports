import { schedule } from '@netlify/functions'
import { run } from '../../lib/grip-email-report.js'

export const handler = schedule('0 6 * * 1', async () => {
  try {
    await run()
    return { statusCode: 200 }
  } catch (err) {
    console.error('Weekly grip email failed:', err)
    return { statusCode: 500, body: err.message }
  }
})
