import { run } from '../../lib/pos-email-report.js'

export const handler = async (event) => {
  const secret = new URLSearchParams(event.rawQuery || '').get('secret')
  if (secret !== process.env.ACTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }
  try {
    await run()
    console.log('POS email sent successfully')
  } catch (err) {
    console.error('POS email failed:', err)
  }
  return { statusCode: 200 }
}
