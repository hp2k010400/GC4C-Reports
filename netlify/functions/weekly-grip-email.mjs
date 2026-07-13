import { schedule } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { run } from '../../lib/grip-email-report.js'

export const handler = schedule('0 6 * * 1', async () => {
  try {
    try {
      const store = getStore('email-locks')
      const today = new Date().toISOString().slice(0, 10)
      const lastSent = await store.get('grip-email-last-sent')
      if (lastSent === today) {
        console.log('Grip email already sent today, skipping')
        return { statusCode: 200 }
      }
      await store.set('grip-email-last-sent', today)
    } catch (blobErr) {
      console.warn('Deduplication check failed, sending anyway:', blobErr.message)
    }

    await run()
    return { statusCode: 200 }
  } catch (err) {
    console.error('Weekly grip email failed:', err)
    return { statusCode: 500, body: err.message }
  }
})
