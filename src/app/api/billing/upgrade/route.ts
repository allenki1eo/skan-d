import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * POST /api/billing/upgrade
 * Body: { planId, paymentMethod }  // paymentMethod: 'mpesa' | 'tigo' | 'airtel' | 'card'
 * Mock: marks the company as upgraded, resets pagesUsed + cycleStart.
 * In production, this is where you'd integrate Selcom or DPO.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super Admin has no company to upgrade.' }, { status: 400 })
  }
  if (!user.companyId) return NextResponse.json({ error: 'No company.' }, { status: 400 })

  const { planId, paymentMethod } = await req.json().catch(() => ({}))
  if (!planId) return NextResponse.json({ error: 'planId required.' }, { status: 400 })

  const plan = await db.plan.findUnique({ where: { id: planId } })
  if (!plan) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

  // MOCK payment — always succeeds. Real flow would:
  //   1. Create a payment request with Selcom/DPO with paymentMethod.
  //   2. Redirect user to mobile-money USSD prompt or card form.
  //   3. Webhook from the gateway marks the payment complete.
  //   4. THEN this endpoint runs the upgrade.
  await new Promise((r) => setTimeout(r, 800)) // simulate gateway latency

  const updated = await db.company.update({
    where: { id: user.companyId },
    data: {
      planId: plan.id,
      pagesUsed: 0,
      cycleStart: new Date(),
    },
    include: { plan: true },
  })

  return NextResponse.json({
    ok: true,
    message: `Upgraded to ${plan.name} via ${paymentMethod || 'mock'}.`,
    company: {
      id: updated.id,
      plan: updated.plan
        ? {
            id: updated.plan.id,
            name: updated.plan.name,
            pageLimit: updated.plan.pageLimit,
            priceTsh: updated.plan.priceTsh,
          }
        : null,
      pagesUsed: updated.pagesUsed,
      cycleStart: updated.cycleStart,
    },
  })
}
