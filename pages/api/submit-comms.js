const FILE_NAME = 'COMMS HOMEMADE.xlsx'
const SHEET_NAME = 'Sheet1'

const HEADERS = [
  'Submitted At',
  'Colleague Name',
  'Customer Name',
  'PO Number / React',
  'Number of Items',
  'Country of Origin',
  'Payment Amount (£)',
  'Date of Payment',
  'Time of Payment',
  'Transaction Type',
  'Sort Code',
  'Account Number',
  'Account Holder Name',
  'PayPal Email',
  'IBAN',
  'BIC / SWIFT Code',
]

// A=1, B=2 ... P=16 -> "P"
const colLetter = (n) => {
  let s = ''
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const LAST_COL = colLetter(HEADERS.length)

async function getMSToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`Auth failed: ${json.error_description || json.error}`)
  return json.access_token
}

async function graphRequest(token, path, method = 'GET', body) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Graph API error ${res.status} on ${path}`)
  }
  if (res.status === 204) return null
  return res.json()
}

async function getFileId(token, userId) {
  const encodedName = encodeURIComponent(FILE_NAME)
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/drive/root:/${encodedName}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 404) {
    throw new Error(
      `Excel file "${FILE_NAME}" not found in your OneDrive root. ` +
      `Please create a blank Excel file with that exact name in your OneDrive and try again.`
    )
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Failed to find file (${res.status})`)
  }
  const file = await res.json()
  return file.id
}

async function appendRow(token, userId, fileId, rowValues) {
  const base = `/users/${userId}/drive/items/${fileId}/workbook/worksheets/${encodeURIComponent(SHEET_NAME)}`

  // Check existing used range to find next empty row
  let nextRow
  try {
    const usedRange = await graphRequest(token, `${base}/usedRange`)
    const rowCount = usedRange.rowCount || 0

    if (rowCount === 0) {
      // Empty sheet — write headers in row 1, data in row 2
      await graphRequest(
        token,
        `${base}/range(address='A1:${LAST_COL}1')`,
        'PATCH',
        { values: [HEADERS] }
      )
      nextRow = 2
    } else {
      // Check if row 1 looks like a header row (non-numeric first cell)
      const firstCell = usedRange.values?.[0]?.[0]
      if (typeof firstCell === 'string' && firstCell.toLowerCase().includes('submitted')) {
        // Has headers — append after last used row
        nextRow = rowCount + 1
      } else {
        // No headers — write them first, shift data
        await graphRequest(
          token,
          `${base}/range(address='A1:${LAST_COL}1')`,
          'PATCH',
          { values: [HEADERS] }
        )
        nextRow = rowCount + 2
      }
    }
  } catch (err) {
    if (err.message.includes('not found in your OneDrive')) throw err
    // If usedRange fails, try starting at row 2 (assume headers in row 1)
    nextRow = 2
  }

  await graphRequest(
    token,
    `${base}/range(address='A${nextRow}:${LAST_COL}${nextRow}')`,
    'PATCH',
    { values: [rowValues] }
  )
}

function formatSubmission(body) {
  const {
    colleagueName, customerName, poNumber, numberOfItems, countryOfOrigin,
    paymentAmount, dateOfPayment, timeOfPayment, transactionType,
    sortCode, accountNumber, holderName, paypalEmail, iban, bicSwift,
  } = body

  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })

  const [yr, mo, dy] = (dateOfPayment || '').split('-')
  const formattedDate = yr ? `${dy}/${mo}/${yr}` : ''

  let formattedTime = timeOfPayment || ''
  if (formattedTime) {
    const [h, m] = formattedTime.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    formattedTime = `${h12}:${String(m).padStart(2, '0')} ${ampm}`
  }

  const isBankTransfer = transactionType === 'Bank Transfer'
  const isPaypal = transactionType === 'Paypal'
  const isInternational = transactionType === 'International'

  return [
    now,
    colleagueName,
    customerName,
    poNumber || '',
    parseInt(numberOfItems) || 0,
    countryOfOrigin,
    `£${parseFloat(paymentAmount).toFixed(2)}`,
    formattedDate,
    formattedTime,
    transactionType,
    isBankTransfer ? (sortCode || '') : '',
    isBankTransfer ? (accountNumber || '') : '',
    isBankTransfer ? (holderName || '') : '',
    isPaypal ? (paypalEmail || '') : '',
    isInternational ? (iban || '') : '',
    isInternational ? (bicSwift || '') : '',
  ]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const required = ['colleagueName', 'customerName', 'numberOfItems', 'countryOfOrigin', 'paymentAmount', 'dateOfPayment', 'timeOfPayment', 'transactionType']
  for (const field of required) {
    if (!req.body[field]) return res.status(400).json({ error: `Missing required field: ${field}` })
  }

  const missing = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'ONEDRIVE_USER_EMAIL'].filter(k => !process.env[k])
  if (missing.length) {
    return res.status(500).json({ error: `Server not configured — missing env vars: ${missing.join(', ')}` })
  }

  let rowValues
  try {
    rowValues = formatSubmission(req.body)
  } catch (err) {
    return res.status(400).json({ error: `Invalid submission data: ${err.message}` })
  }

  try {
    const token = await getMSToken()
    const userId = process.env.ONEDRIVE_USER_EMAIL
    const fileId = await getFileId(token, userId)
    await appendRow(token, userId, fileId, rowValues)
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[submit-comms] Excel write failed:', err.message)
    return res.status(500).json({
      error: err.message,
    })
  }
}
