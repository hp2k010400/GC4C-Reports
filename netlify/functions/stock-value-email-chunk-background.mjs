import { fetchStockValueChunk, sendStockValueEmail } from '../../lib/reports/stock-value-email-report.js'
import { sendEmail } from '../../lib/mailer.js'

const SELF_URL = 'https://gc4creportsandstock.netlify.app/.netlify/functions/stock-value-email-chunk-background'

// Does one time-boxed chunk of the stock catalog fetch, then either sends
// the email (if that was the last chunk) or fires off the next chunk as a
// fresh background invocation (its own 15 min clock) and returns. Never
// called directly by a person — monthly-stock-value-email.js (the
// schedule) and trigger-stock-value-email-background.mjs (manual/testing)
// both just kick off the first link in this chain.
export const handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '')
  if (params.get('secret') !== process.env.ACTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' }
  }

  const cursor = params.get('cursor') || null
  const testRecipient = params.get('to') || undefined
  let accumulator
  try {
    accumulator = params.get('state') ? JSON.parse(Buffer.from(params.get('state'), 'base64').toString('utf8')) : undefined
  } catch {
    accumulator = undefined
  }

  try {
    const result = await fetchStockValueChunk({ cursor, accumulator })

    if (result.done) {
      const sent = await sendStockValueEmail(result.accumulator, testRecipient)
      console.log('Stock Value email sent successfully:', JSON.stringify(sent))
      return { statusCode: 200 }
    }

    // Not done yet — chain to a fresh invocation with a fresh time budget.
    // Netlify acks a background-function call near-instantly and runs it
    // independently after, so awaiting this here doesn't carry this
    // invocation's elapsed time into the next one.
    const state = Buffer.from(JSON.stringify(result.accumulator)).toString('base64')
    const nextParams = new URLSearchParams({ secret: process.env.ACTION_SECRET, cursor: result.cursor, state })
    if (testRecipient) nextParams.set('to', testRecipient)
    await fetch(`${SELF_URL}?${nextParams}`)
    console.log('Stock Value chunk done, chained to next invocation. Cursor:', result.cursor)
    return { statusCode: 200 }
  } catch (err) {
    console.error('Stock Value email chunk failed:', err)
    // Whichever chunk this was, the chain dies here without this — finance/
    // audit need to actually notice a missed month, not find a dead entry
    // in Netlify's logs weeks later. Best-effort; if this also fails it's
    // already logged above.
    try {
      await sendEmail({
        to: 'harry.phillips@golfclubs4cash.co.uk',
        subject: 'Stock Value email FAILED to send',
        html: `<p>The monthly Stock Value email failed mid-run (cursor: ${cursor || 'first chunk'}).</p><pre>${String(err.stack || err.message || err)}</pre>`,
      })
    } catch {}
    return { statusCode: 200 }
  }
}
