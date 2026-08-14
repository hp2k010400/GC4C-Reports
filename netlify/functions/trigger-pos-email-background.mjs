import { run } from '../../lib/pos-email-report.js'

export const handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '')
  if (params.get('secret') !== process.env.ACTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }
  const testRecipient = params.get('to') || undefined
  try {
    await run({ testRecipient })
    console.log('POS + Staff emails sent successfully')
  } catch (err) {
    console.error('POS email failed:', err)
  }
  return { statusCode: 200 }
}
