import { useState } from 'react'
import { useRouter } from 'next/router'

export default function AdjustmentsLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/adjustments-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error('Incorrect password')
      router.push(typeof router.query.next === 'string' ? router.query.next : '/adjustments')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container" style={{ maxWidth: 380 }}>
      <div className="page-title">Stock Adjustments</div>
      <div className="page-sub">This section is restricted. Enter the password to continue.</div>

      <form onSubmit={handleSubmit} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          className="form-input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary" type="submit" disabled={submitting || !password}>
          {submitting ? 'Checking…' : 'Continue'}
        </button>
        {error && <div className="state-box error">{error}</div>}
      </form>
    </div>
  )
}
