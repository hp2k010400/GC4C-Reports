// Manual/testing entry point — kicks off the same self-chaining loop the
// scheduled function uses (see stock-value-email-chunk-background.mjs and
// monthly-stock-value-email.js). Usage:
//   /.netlify/functions/trigger-stock-value-email-background?secret=...
//   /.netlify/functions/trigger-stock-value-email-background?secret=...&to=you@example.com  (solo test)
const CHUNK_URL = 'https://gc4creportsandstock.netlify.app/.netlify/functions/stock-value-email-chunk-background'

export const handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '')
  if (params.get('secret') !== process.env.ACTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }
  const chunkParams = new URLSearchParams({ secret: process.env.ACTION_SECRET })
  const to = params.get('to')
  if (to) chunkParams.set('to', to)

  try {
    await fetch(`${CHUNK_URL}?${chunkParams}`)
    console.log('Stock Value email chain kicked off (manual trigger)')
  } catch (err) {
    console.error('Stock Value email failed to start:', err)
  }
  return { statusCode: 200 }
}
