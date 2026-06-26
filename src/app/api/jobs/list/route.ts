import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * GET /api/jobs/list?companyId=...&limit=50
 * Super Admin → can list any company's jobs (defaults to all).
 * Company Admin → only their own company's jobs.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(100, Number(searchParams.get('limit') || 50))
  const companyIdParam = searchParams.get('companyId')

  let where: { companyId?: string } = {}
  if (user.role === 'SUPER_ADMIN') {
    if (companyIdParam) where.companyId = companyIdParam
  } else {
    if (!user.companyId) return NextResponse.json({ jobs: [] })
    where.companyId = user.companyId
  }

  const jobs = await db.job.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      company: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      fileName: j.fileName,
      totalPages: j.totalPages,
      allowedPages: j.allowedPages,
      processedPages: j.processedPages,
      totalQRCodes: j.totalQRCodes,
      accepted: j.accepted,
      failed: j.failed,
      status: j.status,
      regUrl: j.regUrl,
      pacingMs: j.pacingMs,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      company: j.company,
      user: j.user,
    })),
  })
}
