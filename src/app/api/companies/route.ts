import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hashPassword } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * GET /api/companies
 * Super Admin → all companies.
 * Company Admin → only their own company.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.role === 'SUPER_ADMIN') {
    const companies = await db.company.findMany({
      include: { plan: true, _count: { select: { jobs: true, users: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const enriched = await Promise.all(
      companies.map(async (c) => {
        const stats = await db.job.aggregate({
          where: { companyId: c.id },
          _sum: { accepted: true, failed: true, totalQRCodes: true },
        })
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          region: c.region,
          active: c.active,
          pagesUsed: c.pagesUsed,
          cycleStart: c.cycleStart,
          createdAt: c.createdAt,
          plan: c.plan
            ? {
                id: c.plan.id,
                name: c.plan.name,
                pageLimit: c.plan.pageLimit,
                priceTsh: c.plan.priceTsh,
              }
            : null,
          stats: {
            jobCount: c._count.jobs,
            userCount: c._count.users,
            totalAccepted: stats._sum.accepted || 0,
            totalFailed: stats._sum.failed || 0,
            totalScanned: stats._sum.totalQRCodes || 0,
          },
        }
      }),
    )
    return NextResponse.json({ companies: enriched })
  }

  // Company admin or clerk — only their own company
  if (!user.companyId) return NextResponse.json({ companies: [] })
  const c = await db.company.findUnique({
    where: { id: user.companyId },
    include: { plan: true },
  })
  if (!c) return NextResponse.json({ companies: [] })
  return NextResponse.json({
    companies: [
      {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        region: c.region,
        active: c.active,
        pagesUsed: c.pagesUsed,
        cycleStart: c.cycleStart,
        createdAt: c.createdAt,
        plan: c.plan
          ? { id: c.plan.id, name: c.plan.name, pageLimit: c.plan.pageLimit, priceTsh: c.plan.priceTsh }
          : null,
      },
    ],
  })
}

/**
 * POST /api/companies  (Super Admin only)
 * Body: { name, email, phone?, region?, planId, adminName, adminEmail, adminPassword }
 * Creates the company AND its first Company Admin user in one shot.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super Admin only.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { name, email, phone, region, planId, adminName, adminEmail, adminPassword } = body
  if (!name || !email || !adminName || !adminEmail || !adminPassword) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const existingCompany = await db.company.findUnique({ where: { email: String(email).toLowerCase() } })
  if (existingCompany) return NextResponse.json({ error: 'Company email already in use.' }, { status: 409 })

  const existingAdmin = await db.user.findUnique({ where: { email: String(adminEmail).toLowerCase() } })
  if (existingAdmin) return NextResponse.json({ error: 'Admin email already in use.' }, { status: 409 })

  const passwordHash = await hashPassword(String(adminPassword))
  const company = await db.company.create({
    data: {
      name,
      email: String(email).toLowerCase(),
      phone: phone || null,
      region: region || null,
      planId: planId || null,
      users: {
        create: {
          email: String(adminEmail).toLowerCase(),
          passwordHash,
          name: adminName,
          role: 'COMPANY_ADMIN',
        },
      },
    },
    include: { plan: true, users: true },
  })

  return NextResponse.json({
    company: {
      id: company.id,
      name: company.name,
      email: company.email,
      plan: company.plan,
    },
  })
}

/**
 * PATCH /api/companies  (Super Admin only)
 * Body: { id, active?, planId? }
 * Toggle active status or reassign plan.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super Admin only.' }, { status: 403 })
  }
  const { id, active, planId } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Company id required.' }, { status: 400 })

  const data: { active?: boolean; planId?: string | null } = {}
  if (typeof active === 'boolean') data.active = active
  if (planId !== undefined) data.planId = planId || null

  const updated = await db.company.update({
    where: { id },
    data,
    include: { plan: true },
  })
  return NextResponse.json({ company: updated })
}
