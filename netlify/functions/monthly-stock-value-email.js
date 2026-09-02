import { schedule } from '@netlify/functions'
import { sendEmail } from '../../lib/mailer.js'

const CHUNK_URL = 'https://gc4creportsandstock.netlify.app/.netlify/functions/stock-value-email-chunk-background'

// Netlify's own native scheduler, not a GitHub Actions cron — deliberately.
// The old Matrixify-based version of this report queued behind every other
// scheduled Matrixify report, so it stopped actually starting at 00:01 (per
// Neil Rosie 2026-09-02 — needs to be accurate for finance/audit). GitHub
// Actions cron shares a global queue across every workflow on GitHub too and
// can suffer the same drift, so this uses Netlify's own scheduler instead,
// which only ever runs this one job — nothing else can queue in front of it.
//
// This only kicks off the first link in stock-value-email-chunk-background's
// self-chaining loop — a full run is ~150+ pages against Shopify and took
// 905.5s end to end in a real timed test, past Netlify's 900s background
// function limit, so the actual fetch/aggregate/send work happens over
// several chained invocations there, never in one single call.
const runMonthlyStockValueEmail = async () => {
  try {
    const params = new URLSearchParams({ secret: process.env.ACTION_SECRET })
    await fetch(`${CHUNK_URL}?${params}`)
    console.log('Stock Value email chain kicked off')
  } catch (err) {
    console.error('Stock Value email failed to start:', err)
    try {
      await sendEmail({
        to: 'harry.phillips@golfclubs4cash.co.uk',
        subject: 'Stock Value email FAILED to start',
        html: `<p>The monthly Stock Value email never even started.</p><pre>${String(err.stack || err.message || err)}</pre>`,
      })
    } catch {}
  }
  return { statusCode: 200 }
}

export const handler = schedule('1 0 1 * *', runMonthlyStockValueEmail)
