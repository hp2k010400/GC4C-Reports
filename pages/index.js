import Link from 'next/link'
import { reports } from '../lib/reports/index.js'

export default function Dashboard() {
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
        </div>
      </div>
    </>
  )
}
