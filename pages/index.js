import { useEffect } from 'react'
import Link from 'next/link'
import { reports } from '../lib/reports/index.js'

export default function Dashboard() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shop = params.get('shop')
    const hmac = params.get('hmac')
    if (shop && hmac && !process.env.NEXT_PUBLIC_TOKEN_SET) {
      window.location.href = '/api/auth?shop=' + shop
    }
  }, [])

  return (
    <>
      <div className="header">
        <span className="header-title">GC4C Reports</span>
        <span className="header-sub">Live data — direct from Shopify</span>
      </div>

      <div className="container">
        <div className="page-title">Reports</div>
        <div className="page-sub">Select a report to view live data. All data is pulled directly from Shopify — no sync delay, no missing SKUs.</div>

        <div className="report-grid">
          {Object.entries(reports).map(([slug, report]) => (
            <Link key={slug} href={`/reports/${slug}`} className="report-card">
              <div className="report-card-name">{report.name}</div>
              <div className="report-card-desc">{report.description}</div>
              <span className="report-card-tag">{report.requiresDates ? 'Date range' : 'Live snapshot'}</span>
            </Link>
          ))}
          <Link href="/bulk-update" className="report-card">
            <div className="report-card-name">Bulk Product Update</div>
            <div className="report-card-desc">Upload an edited Product Export CSV to update prices, SKUs, compare-at prices and more across your entire catalogue in one go.</div>
            <span className="report-card-tag">Upload CSV</span>
          </Link>
        </div>
      </div>
    </>
  )
}
