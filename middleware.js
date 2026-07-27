import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/adjustments', '/api/inventory-adjust'],
}

export function middleware(req) {
  const authed = req.cookies.get('adj_auth')?.value === process.env.ADJUSTMENTS_PASSWORD

  if (authed) return NextResponse.next()

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/adjustments-login'
  url.searchParams.set('next', req.nextUrl.pathname)
  return NextResponse.redirect(url)
}
