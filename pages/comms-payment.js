import Head from 'next/head'
import { useState } from 'react'

const COLLEAGUES = [
  'Christopher Smith', 'David Keogh', 'Euan Russel', 'Mark Stewart',
  'Phil Mack', 'Phillip Barron', 'Robert Campbell', 'Samantha Smith',
  'Daniel Allan', 'David Malloy', 'Colin Grant', 'James Malloy',
  'Carter Jerome', 'Jamie Sinclair', 'Ross Murray', 'Jack Hewitt',
  'Jakob Dalland', 'Declan Bickerton', 'Nathan Free',
]

const TRANSACTION_TYPES = ['Bank Transfer', 'Paypal', 'International']

const EMPTY = {
  colleagueName: '',
  customerName: '',
  poNumber: '',
  numberOfItems: '',
  countryOfOrigin: '',
  paymentAmount: '',
  confirmPaymentAmount: '',
  dateOfPayment: '',
  timeOfPayment: '',
  transactionType: '',
  sortCode: '',
  accountNumber: '',
  holderName: '',
  paypalEmail: '',
  iban: '',
  bicSwift: '',
}

function Logo() {
  return (
    <div className="gc-logo-wrap">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="32" fill="#005F2C"/>
        <path d="M20 44 L26 20 L32 34 L38 24 L44 44" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <circle cx="44" cy="20" r="3" fill="white"/>
        <line x1="44" y1="23" x2="44" y2="32" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <line x1="40" y1="27" x2="48" y2="27" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <div className="gc-logo-text">
        <span className="gc-logo-green">golf</span><span className="gc-logo-dark">clubs4</span><span className="gc-logo-green">cash</span>
      </div>
    </div>
  )
}

function Field({ label, required, error, hint, children, className }) {
  return (
    <div className={`gc-field${className ? ` ${className}` : ''}`}>
      <label className="gc-label">
        {label}
        {required && <span className="gc-required"> *</span>}
      </label>
      {children}
      {hint && !error && <div className="gc-hint">{hint}</div>}
      {error && <div className="gc-error-msg">{error}</div>}
    </div>
  )
}

function SuccessPage({ customerName, onReset }) {
  return (
    <div className="gc-page">
      <div className="gc-card">
        <Logo />
        <div className="gc-success">
          <div className="gc-success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className="gc-success-title">Submission Received</h2>
          <p className="gc-success-text">
            Payment details for <strong>{customerName}</strong> have been recorded successfully and saved to the COMMS HOMEMADE spreadsheet.
          </p>
          <button className="gc-btn-primary" onClick={onReset}>
            Submit Another
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CommsPaymentForm() {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const showConfirmAmount = parseFloat(form.paymentAmount) > 999.99
  const isBankTransfer = form.transactionType === 'Bank Transfer'
  const isPaypal = form.transactionType === 'Paypal'
  const isInternational = form.transactionType === 'International'

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: '' }))
  }

  function validate() {
    const e = {}
    if (!form.colleagueName) e.colleagueName = 'Please select a colleague'
    if (!form.customerName.trim()) e.customerName = 'Customer name is required'
    if (!form.numberOfItems || parseInt(form.numberOfItems) < 1) e.numberOfItems = 'Enter a valid number of items'
    if (!form.countryOfOrigin.trim()) e.countryOfOrigin = 'Country of origin is required'
    if (!form.paymentAmount || parseFloat(form.paymentAmount) <= 0) e.paymentAmount = 'Enter a valid payment amount'
    if (showConfirmAmount && form.confirmPaymentAmount !== form.paymentAmount) e.confirmPaymentAmount = 'Amounts do not match — please re-enter'
    if (!form.dateOfPayment) e.dateOfPayment = 'Date of payment is required'
    if (!form.timeOfPayment) e.timeOfPayment = 'Time of payment is required'
    if (!form.transactionType) e.transactionType = 'Please select a transaction type'
    if (isBankTransfer) {
      if (!form.sortCode.trim()) e.sortCode = 'Sort code is required'
      if (!form.accountNumber.trim()) e.accountNumber = 'Account number is required'
      if (!form.holderName.trim()) e.holderName = 'Account holder name is required'
    }
    if (isPaypal) {
      if (!form.paypalEmail.trim()) e.paypalEmail = 'PayPal email is required'
      else if (!/\S+@\S+\.\S+/.test(form.paypalEmail)) e.paypalEmail = 'Enter a valid email address'
    }
    if (isInternational) {
      if (!form.iban.trim()) e.iban = 'IBAN is required'
      if (!form.bicSwift.trim()) e.bicSwift = 'BIC / SWIFT code is required'
    }
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      const firstErrEl = document.querySelector('.gc-error-msg')
      if (firstErrEl) firstErrEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/submit-comms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Submission failed — please try again')
      setSubmitted(true)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setForm(EMPTY)
    setErrors({})
    setSubmitted(false)
    setSubmitError(null)
  }

  if (submitted) return <SuccessPage customerName={form.customerName} onReset={reset} />

  const inputClass = (key) => `gc-input${errors[key] ? ' gc-input-error' : ''}`

  return (
    <>
      <Head>
        <title>GC4C (Comms) Payment Submission</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(160deg, #eef5ef 0%, #f5f7f5 100%);
            min-height: 100vh;
            color: #111827;
          }

          .gc-page {
            min-height: 100vh;
            padding: 40px 16px 60px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }

          .gc-card {
            width: 100%;
            max-width: 600px;
            background: #fff;
            border-radius: 20px;
            box-shadow: 0 4px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
            overflow: hidden;
          }

          .gc-logo-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 36px 40px 28px;
            border-bottom: 1px solid #f3f4f6;
          }

          .gc-logo-text {
            margin-top: 12px;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.3px;
          }

          .gc-logo-green { color: #005F2C; }
          .gc-logo-dark { color: #1a1a1a; }

          .gc-form-header {
            padding: 28px 40px 20px;
          }

          .gc-form-title {
            font-size: 22px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 8px;
            line-height: 1.3;
          }

          .gc-form-subtitle {
            font-size: 13.5px;
            color: #6b7280;
            line-height: 1.5;
          }

          .gc-divider {
            height: 1px;
            background: #f3f4f6;
            margin: 0 40px;
          }

          .gc-section {
            padding: 28px 40px;
          }

          .gc-section-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.1em;
            color: #005F2C;
            text-transform: uppercase;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #005F2C;
            display: inline-block;
          }

          .gc-field {
            margin-bottom: 20px;
          }

          .gc-field-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }

          .gc-label {
            display: block;
            font-size: 13.5px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 7px;
          }

          .gc-required { color: #dc2626; }

          .gc-input {
            width: 100%;
            padding: 11px 14px;
            border: 1.5px solid #d1d5db;
            border-radius: 8px;
            font-size: 15px;
            font-family: inherit;
            color: #111827;
            background: #fff;
            transition: border-color 0.15s, box-shadow 0.15s;
            outline: none;
            -webkit-appearance: none;
            appearance: none;
          }

          .gc-input:focus {
            border-color: #005F2C;
            box-shadow: 0 0 0 3px rgba(0, 95, 44, 0.12);
          }

          .gc-input-error {
            border-color: #ef4444 !important;
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.08) !important;
          }

          .gc-input::placeholder { color: #9ca3af; }

          select.gc-input {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 14px center;
            padding-right: 40px;
            cursor: pointer;
          }

          .gc-prefix-wrap {
            position: relative;
            display: flex;
            align-items: center;
          }

          .gc-prefix {
            position: absolute;
            left: 14px;
            font-size: 15px;
            font-weight: 500;
            color: #6b7280;
            pointer-events: none;
            z-index: 1;
          }

          .gc-input-prefixed { padding-left: 26px; }

          .gc-hint {
            margin-top: 5px;
            font-size: 12px;
            color: #9ca3af;
          }

          .gc-error-msg {
            margin-top: 5px;
            font-size: 12.5px;
            color: #dc2626;
            font-weight: 500;
          }

          .gc-conditional {
            animation: gcFadeIn 0.2s ease both;
          }

          @keyframes gcFadeIn {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: translateY(0); }
          }

          .gc-error-banner {
            margin: 0 40px 20px;
            padding: 14px 16px;
            background: #fef2f2;
            border: 1px solid #fca5a5;
            border-radius: 8px;
            font-size: 13.5px;
            color: #b91c1c;
            line-height: 1.5;
          }

          .gc-form-footer {
            padding: 8px 40px 36px;
          }

          .gc-btn-primary {
            width: 100%;
            padding: 14px;
            background: #005F2C;
            color: #fff;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
            letter-spacing: 0.01em;
          }

          .gc-btn-primary:hover:not(:disabled) {
            background: #004a23;
            box-shadow: 0 4px 16px rgba(0, 95, 44, 0.25);
          }

          .gc-btn-primary:active:not(:disabled) { transform: scale(0.99); }

          .gc-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

          .gc-success {
            padding: 48px 40px 52px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .gc-success-icon {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: #005F2C;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0, 95, 44, 0.3);
          }

          .gc-success-title {
            font-size: 24px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 12px;
          }

          .gc-success-text {
            font-size: 15px;
            color: #6b7280;
            line-height: 1.6;
            margin-bottom: 32px;
            max-width: 380px;
          }

          .gc-success-text strong { color: #111827; }

          .gc-btn-primary.gc-btn-narrow {
            max-width: 220px;
          }

          @media (max-width: 520px) {
            .gc-page { padding: 16px 12px 40px; }
            .gc-card { border-radius: 16px; }
            .gc-logo-wrap { padding: 28px 24px 20px; }
            .gc-form-header { padding: 20px 24px 16px; }
            .gc-divider { margin: 0 24px; }
            .gc-section { padding: 24px 24px; }
            .gc-form-footer { padding: 8px 24px 28px; }
            .gc-field-row { grid-template-columns: 1fr; gap: 0; }
            .gc-error-banner { margin: 0 24px 16px; }
            .gc-success { padding: 36px 24px 40px; }
          }
        `}</style>
      </Head>

      <div className="gc-page">
        <div className="gc-card">
          <Logo />

          <div className="gc-form-header">
            <h1 className="gc-form-title">GC4C (Comms) Payment Submission</h1>
            <p className="gc-form-subtitle">Please complete all sections accurately. This form is for internal and customer use by Golfclubs4cash Ltd.</p>
          </div>

          <div className="gc-divider" />

          <form onSubmit={handleSubmit} noValidate>
            <div className="gc-section">
              <div className="gc-section-label">Staff to Complete</div>

              <Field label="Colleague Name" required error={errors.colleagueName}>
                <select className={inputClass('colleagueName')} value={form.colleagueName} onChange={e => update('colleagueName', e.target.value)}>
                  <option value="">Please Select</option>
                  {COLLEAGUES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Customer Name" required error={errors.customerName}>
                <input className={inputClass('customerName')} type="text" value={form.customerName} onChange={e => update('customerName', e.target.value)} placeholder="Full name" />
              </Field>

              <Field label="PO Number / React" error={errors.poNumber}>
                <input className="gc-input" type="text" value={form.poNumber} onChange={e => update('poNumber', e.target.value)} placeholder="Optional" />
              </Field>

              <Field label="Number of Items" required error={errors.numberOfItems}>
                <input className={inputClass('numberOfItems')} type="number" min="1" value={form.numberOfItems} onChange={e => update('numberOfItems', e.target.value)} placeholder="0" />
              </Field>

              <Field label="Country of Origin" required error={errors.countryOfOrigin}>
                <input className={inputClass('countryOfOrigin')} type="text" value={form.countryOfOrigin} onChange={e => update('countryOfOrigin', e.target.value)} />
              </Field>

              <Field label="Payment Amount" required error={errors.paymentAmount} hint="Please enter with two decimal places (e.g., 100.00)">
                <div className="gc-prefix-wrap">
                  <span className="gc-prefix">£</span>
                  <input className={`${inputClass('paymentAmount')} gc-input-prefixed`} type="number" step="0.01" min="0" value={form.paymentAmount} onChange={e => update('paymentAmount', e.target.value)} placeholder="0.00" />
                </div>
              </Field>

              {showConfirmAmount && (
                <div className="gc-conditional">
                  <Field label="Confirm Payment Amount" required error={errors.confirmPaymentAmount} hint="Re-enter the amount to confirm — required for payments over £999.99">
                    <div className="gc-prefix-wrap">
                      <span className="gc-prefix">£</span>
                      <input className={`${inputClass('confirmPaymentAmount')} gc-input-prefixed`} type="number" step="0.01" min="0" value={form.confirmPaymentAmount} onChange={e => update('confirmPaymentAmount', e.target.value)} placeholder="0.00" />
                    </div>
                  </Field>
                </div>
              )}

              <div className="gc-field-row">
                <Field label="Date of Payment" required error={errors.dateOfPayment}>
                  <input className={inputClass('dateOfPayment')} type="date" value={form.dateOfPayment} onChange={e => update('dateOfPayment', e.target.value)} />
                </Field>
                <Field label="Time of Payment" required error={errors.timeOfPayment}>
                  <input className={inputClass('timeOfPayment')} type="time" value={form.timeOfPayment} onChange={e => update('timeOfPayment', e.target.value)} />
                </Field>
              </div>

              <Field label="Transaction Type" required error={errors.transactionType}>
                <select className={inputClass('transactionType')} value={form.transactionType} onChange={e => { update('transactionType', e.target.value); setForm(f => ({ ...f, sortCode: '', accountNumber: '', holderName: '', paypalEmail: '', iban: '', bicSwift: '' })) }}>
                  <option value="">Please Select</option>
                  {TRANSACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>

              {isBankTransfer && (
                <div className="gc-conditional">
                  <Field label="Sort Code" required error={errors.sortCode}>
                    <input className={inputClass('sortCode')} type="text" value={form.sortCode} onChange={e => update('sortCode', e.target.value)} placeholder="XX-XX-XX" maxLength={8} />
                  </Field>
                  <Field label="Account Number" required error={errors.accountNumber}>
                    <input className={inputClass('accountNumber')} type="text" value={form.accountNumber} onChange={e => update('accountNumber', e.target.value)} placeholder="8-digit account number" maxLength={8} />
                  </Field>
                  <Field label="Account Holder Name" required error={errors.holderName}>
                    <input className={inputClass('holderName')} type="text" value={form.holderName} onChange={e => update('holderName', e.target.value)} />
                  </Field>
                </div>
              )}

              {isPaypal && (
                <div className="gc-conditional">
                  <Field label="PayPal Email" required error={errors.paypalEmail}>
                    <input className={inputClass('paypalEmail')} type="email" value={form.paypalEmail} onChange={e => update('paypalEmail', e.target.value)} placeholder="example@example.com" />
                  </Field>
                </div>
              )}

              {isInternational && (
                <div className="gc-conditional">
                  <Field label="IBAN" required error={errors.iban}>
                    <input className={inputClass('iban')} type="text" value={form.iban} onChange={e => update('iban', e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="BIC / SWIFT Code" required error={errors.bicSwift}>
                    <input className={inputClass('bicSwift')} type="text" value={form.bicSwift} onChange={e => update('bicSwift', e.target.value.toUpperCase())} />
                  </Field>
                </div>
              )}
            </div>

            {submitError && (
              <div className="gc-error-banner">{submitError}</div>
            )}

            <div className="gc-form-footer">
              <button type="submit" className="gc-btn-primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Details'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
