import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { countPdfPages } from '@/lib/engine'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/jobs/upload
 * Multipart form-data: file (PDF), regUrl (string)
 *
 * Reads the PDF, counts pages, enforces the company's plan limit, creates a
 * Job record (status=PENDING) and returns the job + the page-limit breakdown
 * so the UI can render the "active vs locked" page visualization.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super Admin cannot run jobs. Log in as a company admin.' }, { status: 403 })
  }
  if (!user.companyId) return NextResponse.json({ error: 'No company associated with this user.' }, { status: 400 })

  const company = await db.company.findUnique({
    where: { id: user.companyId },
    include: { plan: true },
  })
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 })
  if (!company.active) return NextResponse.json({ error: 'Company is deactivated.' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const regUrl = (form.get('regUrl') as string | null) || ''
  const pacingMs = Number(form.get('pacingMs') || 500)

  if (!file) return NextResponse.json({ error: 'No PDF file uploaded.' }, { status: 400 })
  if (!regUrl.startsWith('http')) return NextResponse.json({ error: 'Invalid TCB registration URL.' }, { status: 400 })
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'File must be a PDF.' }, { status: 400 })
  }

  const buf = new Uint8Array(await file.arrayBuffer())
  let totalPages = 0
  try {
    totalPages = await countPdfPages(buf)
  } catch (err) {
    console.error('PDF parse error:', err)
    return NextResponse.json({ error: 'Could not read PDF. Make sure it is a valid PDF file.' }, { status: 422 })
  }

  // Plan enforcement — the heart of the page-limit feature
  const planLimit = company.plan?.pageLimit ?? 0
  const remainingInCycle = planLimit === -1 ? Infinity : Math.max(0, planLimit - company.pagesUsed)
  const allowedPages =
    planLimit === -1
      ? totalPages
      : Math.min(totalPages, remainingInCycle)

  const lockedPages = totalPages - allowedPages
  const overLimit = lockedPages > 0

  const job = await db.job.create({
    data: {
      companyId: company.id,
      userId: user.id,
      fileName: file.name,
      totalPages,
      allowedPages,
      processedPages: 0,
      totalQRCodes: 0,
      accepted: 0,
      failed: 0,
      status: 'PENDING',
      regUrl,
      pacingMs: Math.max(100, Math.min(5000, pacingMs)),
    },
  })

  // Stash the PDF bytes in a server-side in-memory store keyed by jobId.
  // The /api/jobs/start route will pick it up to actually process.
  pdfStore.set(job.id, buf)

  return NextResponse.json({
    job: {
      id: job.id,
      fileName: job.fileName,
      totalPages,
      allowedPages,
      lockedPages,
      overLimit,
      status: job.status,
      regUrl: job.regUrl,
      pacingMs: job.pacingMs,
      createdAt: job.createdAt,
    },
    plan: {
      name: company.plan?.name ?? 'No plan',
      pageLimit: planLimit,
      pagesUsed: company.pagesUsed,
      remainingInCycle: remainingInCycle === Infinity ? 'unlimited' : remainingInCycle,
    },
  })
}

// In-memory PDF store. In production this would be S3 / disk / Redis.
// For this single-process Next.js app it is sufficient.
export const pdfStore = new Map<string, Uint8Array>()
