import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * GET /api/jobs/report/[id]
 * Downloads a CSV report of every QR/bale in the job.
 * Columns: page_number, qr_url, status, message, accepted_at
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const job = await db.job.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (user.role !== 'SUPER_ADMIN' && job.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const items = await db.jobItem.findMany({
    where: { jobId: id },
    orderBy: [{ pageNumber: 'asc' }, { id: 'asc' }],
  })

  const escape = (s: string | null | undefined) => {
    if (!s) return ''
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const rows = [
    ['page_number', 'qr_url', 'status', 'message', 'accepted_at'].join(','),
    ...items.map((it) =>
      [
        it.pageNumber,
        escape(it.qrUrl),
        it.status,
        escape(it.message),
        it.acceptedAt ? new Date(it.acceptedAt).toISOString() : '',
      ].join(','),
    ),
  ]
  const csv = rows.join('\n')

  const safeName = job.fileName.replace(/[^a-z0-9._-]/gi, '_')
  const filename = `baletrack_${safeName}_${job.id.slice(-6)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
