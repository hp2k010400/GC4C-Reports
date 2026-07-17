import { run } from '../../lib/grip-email-report.js'

export const handler = async (event) => {
  const secret = new URLSearchParams(event.rawQuery || '').get('secret')
  if (secret !== process.env.ACTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }
  try {
    await run()
    console.log('Grip email sent successfully')
  } catch (err) {
    console.error('Grip email failed:', err)
  }
  return { statusCode: 200 }
}
