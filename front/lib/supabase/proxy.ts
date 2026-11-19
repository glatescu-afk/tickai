import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/config'

const publicAuthPaths = new Set([
  '/client/connexion',
  '/client/inscription',
  '/support/connexion',
])

function redirectWithCookies(response: NextResponse, url: URL) {
  const redirectResponse = NextResponse.redirect(url)
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
  return redirectResponse
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  const pathname = request.nextUrl.pathname
  const isClientArea = pathname === '/client' || pathname.startsWith('/client/')
  const isSupportArea = pathname === '/support' || pathname.startsWith('/support/')
  const isProtected = (isClientArea || isSupportArea) && !publicAuthPaths.has(pathname)

  if (!isProtected) return response

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const destination = request.nextUrl.clone()
    destination.pathname = isSupportArea ? '/support/connexion' : '/client/connexion'
    destination.search = ''
    return redirectWithCookies(response, destination)
  }

  const { data: profile } = await supabase
    .from('profils')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const requiredRole = isSupportArea ? 'support' : 'client'
  if (profile?.role !== requiredRole) {
    const destination = request.nextUrl.clone()
    destination.pathname = isSupportArea ? '/support/connexion' : '/client/connexion'
    destination.search = ''
    return redirectWithCookies(response, destination)
  }

  return response
}
