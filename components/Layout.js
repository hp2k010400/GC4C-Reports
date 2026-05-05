import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV = [
  { label: 'Reports', href: '/' },
  { label: 'Bulk Edit', href: '/bulk-update' },
  { label: 'History', href: '/history' },
  { label: 'Settings', href: '/settings' },
]

function isActive(href, pathname) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/reports')
  return pathname === href || pathname.startsWith(href + '/')
}

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
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive(item.href, router.pathname) ? ' nav-link-active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
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
