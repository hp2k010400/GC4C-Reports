import { schedule } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { run } from '../../lib/grip-email-report.js'

export const handler = schedule('0 6 * * 1', async () => {
  try {
    const store = getStore('email-locks')
    const today = new Date().toISOString().slice(0, 10)
    const lastSent = await store.get('grip-email-last-sent')

    if (lastSent === today) {
      console.log('Grip email already sent today, skipping duplicate trigger')
      return { statusCode: 200 }
    }

    await store.set('grip-email-last-sent', today)
    await run()
    return { statusCode: 200 }
  } catch (err) {
    console.error('Weekly grip email failed:', err)
    return { statusCode: 500, body: err.message }
  }
})
