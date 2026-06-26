import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setSessionCookie, verifyPassword } from '@/lib/auth'

export const runtime = 'nodejs'

/** POST /api/auth/login  { email, password } */
export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { email: String(email).toLowerCase() },
    include: { company: true },
  })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }
  if (user.company && !user.company.active) {
    return NextResponse.json({ error: 'Your company account is deactivated. Contact support.' }, { status: 403 })
  }

  await setSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CLERK',
    companyId: user.companyId,
  })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    },
  })
}
