import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/api/query(.*)',
  '/api/integrations(.*)',
  '/api/knowledge(.*)',
  '/api/decisions(.*)',
  '/api/ideas(.*)',
  '/api/context(.*)',
  '/api/email(.*)',
  '/api/user(.*)',
])

// Routes that accept API key auth as an alternative to Clerk session
const isApiKeyRoute = createRouteMatcher([
  '/api/query(.*)',
  '/api/context(.*)',
  '/api/decisions/create(.*)',
])

const isPublicIntegrationRoute = createRouteMatcher([
  '/api/webhooks/clerk',
  '/api/integrations/slack/callback',
  '/api/integrations/linear/webhook',
  '/api/integrations/linear/callback',
  '/api/integrations/notion/callback',
  '/api/inn/callback',
  '/api/integrations/gmail/callback',
  '/api/integrations/slack/events',
])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicIntegrationRoute(req)) return NextResponse.next()

  // Allow requests with a Bearer token through to the route handler,
  // which performs its own timing-safe API key validation
  if (isApiKeyRoute(req) && req.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.next()
  }

  if (isProtectedRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', req.url)
      return NextResponse.redirect(signInUrl)
    }
  }
})

export const config = {
  matcher: [
    '/((?!.*\\..*|_next).*)',
    '/',
    '/(api|trpc)(.*)',
  ],
}
