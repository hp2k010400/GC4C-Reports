import { schedule } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { run } from '../../lib/pos-email-report.js'

export const handler = schedule('0 18 * * *', async () => {
  try {
    const store = getStore('email-locks')
    const today = new Date().toISOString().slice(0, 10)
    const lastSent = await store.get('pos-email-last-sent')

    if (lastSent === today) {
      console.log('POS email already sent today, skipping duplicate trigger')
      return { statusCode: 200 }
    }

    await store.set('pos-email-last-sent', today)
    await run()
    return { statusCode: 200 }
  } catch (err) {
    console.error('Daily POS email failed:', err)
    return { statusCode: 500, body: err.message }
  }
})
