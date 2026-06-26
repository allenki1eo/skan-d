import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/** GET /api/auth/me — returns the currently logged-in user (or 401). */
export async function GET() {
  const session = await getCurrentUser()
  if (!session) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({
    user: {
      id: session.id,
      email: session.email,
      name: session.name,
      role: session.role,
      companyId: session.companyId,
    },
    company: session.company
      ? {
          id: session.company.id,
          name: session.company.name,
          region: session.company.region,
          active: session.company.active,
          pagesUsed: session.company.pagesUsed,
          cycleStart: session.company.cycleStart,
          plan: session.company.plan
            ? {
                id: session.company.plan.id,
                name: session.company.plan.name,
                pageLimit: session.company.plan.pageLimit,
                priceTsh: session.company.plan.priceTsh,
                description: session.company.plan.description,
              }
            : null,
        }
      : null,
  })
}
