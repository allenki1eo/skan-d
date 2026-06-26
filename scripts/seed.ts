/**
 * Seed script for BaleTrack Pro.
 * Run with: bun run scripts/seed.ts
 *
 * Creates:
 *  - 3 plans (Trial, Pro, Enterprise)
 *  - 1 Super Admin user (you)
 *  - 2 sample companies + their admin users
 *  - A handful of historical jobs for demo purposes
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding BaleTrack Pro…')

  // ─── Plans ────────────────────────────────────────────────────────────
  const trial = await db.plan.upsert({
    where: { name: 'Trial' },
    update: {},
    create: {
      name: 'Trial',
      pageLimit: 10,
      priceTsh: 0,
      description: 'Free trial — up to 10 PDF pages (~500 bale scans).',
    },
  })

  const pro = await db.plan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      pageLimit: 500,
      priceTsh: 350000, // ~TSH 350,000 / month
      description: 'Pro plan — up to 500 PDF pages per billing cycle.',
    },
  })

  const enterprise = await db.plan.upsert({
    where: { name: 'Enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      pageLimit: -1,
      priceTsh: 1500000,
      description: 'Enterprise — unlimited pages, priority support.',
    },
  })

  // ─── Super Admin ───────────────────────────────────────────────────────
  const superPwdHash = await bcrypt.hash('superadmin123', 10)
  await db.user.upsert({
    where: { email: 'super@baletrack.co' },
    update: {},
    create: {
      email: 'super@baletrack.co',
      passwordHash: superPwdHash,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
    },
  })

  // ─── Sample Company 1: Shinyanga Ginnery ────────────────────────────
  const shinyanga = await db.company.upsert({
    where: { email: 'ops@shinyanga-ginnery.co.tz' },
    update: {},
    create: {
      name: 'Shinyanga Cotton Ginnery',
      email: 'ops@shinyanga-ginnery.co.tz',
      phone: '+255 754 000 111',
      region: 'Shinyanga',
      active: true,
      planId: trial.id,
      pagesUsed: 0,
    },
  })

  const shinyangaAdminHash = await bcrypt.hash('demo1234', 10)
  await db.user.upsert({
    where: { email: 'manager@shinyanga-ginnery.co.tz' },
    update: {},
    create: {
      email: 'manager@shinyanga-ginnery.co.tz',
      passwordHash: shinyangaAdminHash,
      name: 'Joseph Mwakyusa',
      role: 'COMPANY_ADMIN',
      companyId: shinyanga.id,
    },
  })

  // ─── Sample Company 2: Mwanza Alliance ──────────────────────────────
  const mwanza = await db.company.upsert({
    where: { email: 'ops@mwanza-alliance.co.tz' },
    update: {},
    create: {
      name: 'Mwanza Alliance Ginnery',
      email: 'ops@mwanza-alliance.co.tz',
      phone: '+255 784 000 222',
      region: 'Mwanza',
      active: true,
      planId: pro.id,
      pagesUsed: 42,
    },
  })

  const mwanzaAdminHash = await bcrypt.hash('demo1234', 10)
  const mwanzaAdmin = await db.user.upsert({
    where: { email: 'manager@mwanza-alliance.co.tz' },
    update: {},
    create: {
      email: 'manager@mwanza-alliance.co.tz',
      passwordHash: mwanzaAdminHash,
      name: 'Asha Mchuma',
      role: 'COMPANY_ADMIN',
      companyId: mwanza.id,
    },
  })

  // ─── Demo historical jobs (so dashboards aren't empty) ──────────────
  const existingJobs = await db.job.count()
  if (existingJobs === 0) {
    await db.job.create({
      data: {
        companyId: mwanza.id,
        userId: mwanzaAdmin.id,
        fileName: 'tcb_dispatch_week22.pdf',
        totalPages: 38,
        allowedPages: 38,
        processedPages: 38,
        totalQRCodes: 532,
        accepted: 530,
        failed: 2,
        status: 'COMPLETED',
        regUrl: 'https://tcb.go.tz/register/device/abc123',
        pacingMs: 500,
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
        completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7 + 1000 * 60 * 9),
      },
    })

    await db.job.create({
      data: {
        companyId: mwanza.id,
        userId: mwanzaAdmin.id,
        fileName: 'tcb_dispatch_week23.pdf',
        totalPages: 24,
        allowedPages: 24,
        processedPages: 24,
        totalQRCodes: 348,
        accepted: 348,
        failed: 0,
        status: 'COMPLETED',
        regUrl: 'https://tcb.go.tz/register/device/abc123',
        pacingMs: 500,
        startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
        completedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 6),
      },
    })
  }

  console.log('✅ Seed complete.\n')
  console.log('─── Login credentials ───')
  console.log('Super Admin     : super@baletrack.co  /  superadmin123')
  console.log('Shinyanga Admin : manager@shinyanga-ginnery.co.tz  /  demo1234')
  console.log('Mwanza Admin    : manager@mwanza-alliance.co.tz  /  demo1234')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
