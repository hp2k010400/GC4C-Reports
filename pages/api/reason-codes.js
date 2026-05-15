import { getStore } from '@netlify/blobs'

const STORE_KEY = 'reason-codes'

const DEFAULTS = [
  { label: 'Damaged',                   shopifyCode: 'damaged' },
  { label: 'Found — count correction',  shopifyCode: 'correction' },
  { label: 'Missing — count correction',shopifyCode: 'correction' },
  { label: 'Theft',                     shopifyCode: 'theft_or_loss' },
  { label: 'Sample / Demo',             shopifyCode: 'promotion' },
  { label: 'Sent for Repair',           shopifyCode: 'quality_control' },
  { label: 'Returned to Stock',         shopifyCode: 'received' },
  { label: 'Other',                     shopifyCode: 'other' },
]

async function getCodes() {
  try {
    const store = getStore('gc4c-settings')
    const data = await store.get(STORE_KEY, { type: 'json' })
    return Array.isArray(data) ? data : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

async function saveCodes(codes) {
  const store = getStore('gc4c-settings')
  await store.set(STORE_KEY, JSON.stringify(codes))
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const codes = await getCodes()
    return res.status(200).json({ codes })
  }

  if (req.method === 'POST') {
    const { label, shopifyCode } = req.body
    if (!label?.trim() || !shopifyCode) return res.status(400).json({ error: 'label and shopifyCode required' })
    const codes = await getCodes()
    if (codes.find(c => c.label === label.trim())) return res.status(400).json({ error: 'Reason already exists' })
    codes.push({ label: label.trim(), shopifyCode })
    await saveCodes(codes)
    return res.status(200).json({ codes })
  }

  if (req.method === 'DELETE') {
    const { label } = req.query
    if (!label) return res.status(400).json({ error: 'label required' })
    const codes = await getCodes()
    await saveCodes(codes.filter(c => c.label !== label))
    return res.status(200).json({ ok: true })
  }

  res.status(405).end()
}
