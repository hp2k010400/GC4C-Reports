import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV = [
  {
    label: 'Stock',
    items: [
      { label: 'Products', href: '/products' },
      { label: 'Deletions', href: '/deletion-candidates' },
      { label: 'Adjustments', href: '/adjustments' },
      { label: 'Transfers', href: '/transfer-forecast' },
      { label: 'Bulk Edit', href: '/bulk-update' },
    ],
  },
  {
    label: 'Dispatch',
    items: [
      { label: 'Orders', href: '/orders' },
      { label: 'Fulfillments', href: '/fulfillments' },
      { label: 'Returns', href: '/returns' },
      { label: 'Combined', href: '/combined' },
    ],
  },
  { label: 'Reports', href: '/' },
]

function isActive(href, pathname) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/reports')
  return pathname === href || pathname.startsWith(href + '/')
}

const CHEVRON = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, opacity: 0.7 }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

export default function Layout({ children }) {
  const router = useRouter()
  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="header-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <Link href="/" className="header-title">GC4C Reports</Link>
          <nav className="header-nav">
            {NAV.map(group =>
              group.items ? (
                <div key={group.label} className="nav-dropdown">
                  <button
                    className={`nav-link nav-dropdown-trigger${group.items.some(i => isActive(i.href, router.pathname)) ? ' nav-link-active' : ''}`}
                  >
                    {group.label}{CHEVRON}
                  </button>
                  <div className="nav-dropdown-menu">
                    {group.items.map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-dropdown-item${isActive(item.href, router.pathname) ? ' nav-dropdown-item-active' : ''}`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={group.href}
                  href={group.href}
                  className={`nav-link${isActive(group.href, router.pathname) ? ' nav-link-active' : ''}`}
                >
                  {group.label}
                </Link>
              )
            )}
          </nav>
        </div>
        <span className="header-live">
          <span className="header-live-dot" />
          Live
        </span>
      </div>
      {children}
    </>
  )
}
