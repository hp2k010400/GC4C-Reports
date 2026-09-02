import { run } from '../../lib/reports/stock-value-email-report.js'

export const handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '')
  if (params.get('secret') !== process.env.ACTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }
  const testRecipient = params.get('to') || undefined
  try {
    await run({ testRecipient })
    console.log('Stock Value email sent successfully')
  } catch (err) {
    console.error('Stock Value email failed:', err)
  }
  return { statusCode: 200 }
}
