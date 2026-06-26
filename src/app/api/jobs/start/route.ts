import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { acceptBaleOnTCB, decodeQRCodesFromPdf, registerTcbDevice, DecodedQR } from '@/lib/engine'
import { pdfStore } from '@/app/api/jobs/upload/route'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes — big PDFs take time

/**
 * POST /api/jobs/start  { jobId }
 *
 * Kicks off processing for a previously-uploaded job:
 *   1. Register the device with TCB (gets a session cookie).
 *   2. Decode QR codes from pages 1..allowedPages.
 *   3. For each QR URL, call acceptBaleOnTCB() with pacing.
 *   4. Update the DB continuously so /api/jobs/detail can poll.
 *
 * Returns immediately with the job in RUNNING state. The actual processing
 * happens in the background (fire-and-forget async work on this same route).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super Admin cannot run jobs.' }, { status: 403 })
  }

  const { jobId } = await req.json().catch(() => ({}))
  if (!jobId) return NextResponse.json({ error: 'jobId required.' }, { status: 400 })

  const job = await db.job.findUnique({ where: { id: jobId }, include: { company: true } })
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  if (job.companyId !== user.companyId) {
    return NextResponse.json({ error: 'Job does not belong to your company.' }, { status: 403 })
  }
  if (job.status !== 'PENDING') {
    return NextResponse.json({ error: `Job already ${job.status}.` }, { status: 409 })
  }

  const pdf = pdfStore.get(job.id)
  if (!pdf) {
    return NextResponse.json(
      { error: 'PDF buffer expired. Please re-upload the file.' },
      { status: 410 },
    )
  }

  // Mark RUNNING and fire background work
  await db.job.update({
    where: { id: job.id },
    data: { status: 'RUNNING', startedAt: new Date() },
  })

  // Don't await — fire-and-forget so the response can return immediately
  void processJobInBackground(job.id, pdf, job.regUrl, job.allowedPages, job.pacingMs, job.companyId, job.company?.planId ?? null)

  return NextResponse.json({ ok: true, jobId: job.id, status: 'RUNNING' })
}

/**
 * The actual processing pipeline. Runs in the background after the HTTP
 * response has been sent. Updates the DB continuously so the polling
 * /api/jobs/detail endpoint reflects live progress.
 */
async function processJobInBackground(
  jobId: string,
  pdf: Uint8Array,
  regUrl: string,
  allowedPages: number,
  pacingMs: number,
  companyId: string,
  planId: string | null,
) {
  console.log(`[job ${jobId}] starting — ${allowedPages} pages, pacing ${pacingMs}ms`)

  try {
    // 1. Register TCB device → get session cookie
    const reg = await registerTcbDevice(regUrl)
    if (!reg.ok) {
      await db.job.update({
        where: { id: jobId },
        data: { status: 'FAILED', completedAt: new Date() },
      })
      console.error(`[job ${jobId}] TCB registration failed: ${reg.message}`)
      return
    }
    const sessionCookie = reg.cookie

    // 2. Decode all QR codes from pages 1..allowedPages
    const decoded: DecodedQR[] = []
    for (let page = 1; page <= allowedPages; page++) {
      const pageResults = await decodeQRCodesFromPdf(pdf, page, page)
      decoded.push(...pageResults)
      await db.job.update({
        where: { id: jobId },
        data: {
          processedPages: page,
          totalQRCodes: decoded.length,
        },
      })
      console.log(`[job ${jobId}] page ${page}/${allowedPages} — ${pageResults.length} QRs (total: ${decoded.length})`)
    }

    // 3. Create JobItem rows for each QR
    if (decoded.length > 0) {
      await db.jobItem.createMany({
        data: decoded.map((d) => ({
          jobId,
          pageNumber: d.pageNumber,
          qrUrl: d.url,
          status: 'PENDING',
        })),
      })
    }

    // 4. For each QR, call the TCB accept hook with pacing
    let accepted = 0
    let failed = 0
    const items = await db.jobItem.findMany({ where: { jobId }, orderBy: { id: 'asc' } })
    for (const item of items) {
      const result = await acceptBaleOnTCB(item.qrUrl, sessionCookie)
      if (result.ok) accepted++
      else failed++

      await db.jobItem.update({
        where: { id: item.id },
        data: {
          status: result.ok ? 'ACCEPTED' : 'FAILED',
          message: result.message,
          acceptedAt: result.ok ? new Date() : null,
        },
      })
      await db.job.update({
        where: { id: jobId },
        data: { accepted, failed },
      })

      // Pacing to avoid tripping TCB rate limits
      await new Promise((r) => setTimeout(r, pacingMs))
    }

    // 5. Bump the company's pagesUsed counter
    await db.company.update({
      where: { id: companyId },
      data: { pagesUsed: { increment: allowedPages } },
    })

    await db.job.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })

    console.log(`[job ${jobId}] completed — ${accepted} accepted, ${failed} failed`)

    // Free the PDF buffer
    pdfStore.delete(jobId)
  } catch (err) {
    console.error(`[job ${jobId}] FAILED:`, err)
    await db.job.update({
      where: { id: jobId },
      data: { status: 'FAILED', completedAt: new Date() },
    })
  }
}
