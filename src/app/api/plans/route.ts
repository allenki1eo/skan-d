import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * GET /api/plans
 * Public list of all subscription plans (for upgrade UI).
 */
export async function GET() {
  const plans = await db.plan.findMany({ orderBy: { priceTsh: 'asc' } })
  return NextResponse.json({ plans })
}

/** POST /api/plans — Super Admin only: create a plan. */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super Admin only.' }, { status: 403 })
  }
  const { name, pageLimit, priceTsh, description } = await req.json()
  if (!name || pageLimit == null || priceTsh == null) {
    return NextResponse.json({ error: 'Missing fields.' }, { status: 400 })
  }
  const plan = await db.plan.create({
    data: {
      name,
      pageLimit: Number(pageLimit),
      priceTsh: Number(priceTsh),
      description: description || '',
    },
  })
  return NextResponse.json({ plan })
}
