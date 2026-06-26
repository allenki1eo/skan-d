import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * GET /api/jobs/detail/[id]
 * Returns the full job + recent job items (for live progress UI).
 * Optional ?itemsLimit=N (default 50, max 500)
 * Optional ?itemStatus=ACCEPTED|FAILED|PENDING to filter items
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const itemsLimit = Math.min(500, Number(searchParams.get('itemsLimit') || 50))
  const itemStatus = searchParams.get('itemStatus') // undefined = all

  const job = await db.job.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Authorization: company users can only see their own company's jobs
  if (user.role !== 'SUPER_ADMIN' && job.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where: { jobId: string; status?: string } = { jobId: id }
  if (itemStatus) where.status = itemStatus

  const items = await db.jobItem.findMany({
    where,
    orderBy: { id: 'asc' },
    take: itemsLimit,
  })

  return NextResponse.json({
    job: {
      id: job.id,
      fileName: job.fileName,
      totalPages: job.totalPages,
      allowedPages: job.allowedPages,
      processedPages: job.processedPages,
      totalQRCodes: job.totalQRCodes,
      accepted: job.accepted,
      failed: job.failed,
      status: job.status,
      regUrl: job.regUrl,
      pacingMs: job.pacingMs,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      company: job.company,
      user: job.user,
    },
    items: items.map((it) => ({
      id: it.id,
      pageNumber: it.pageNumber,
      qrUrl: it.qrUrl,
      status: it.status,
      message: it.message,
      acceptedAt: it.acceptedAt,
    })),
  })
}
