/**
 * Auth helpers — JWT issuance & verification, password hashing.
 * We use a long-lived symmetric JWT stored in a httpOnly cookie.
 */
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'baletrack-dev-secret-change-in-production'
const COOKIE_NAME = 'bt_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

export type SessionUser = {
  id: string
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CLERK'
  companyId: string | null
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function signToken(user: SessionUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: `${SESSION_MAX_AGE_SECONDS}s` })
}

export function verifyToken(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as SessionUser
    return payload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function setSessionCookie(user: SessionUser) {
  const store = await cookies()
  const token = signToken(user)
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

/**
 * Resolve the full user record (with company) for the current session.
 * Returns null if the session is invalid or the user no longer exists.
 */
export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  const user = await db.user.findUnique({
    where: { id: session.id },
    include: { company: { include: { plan: true } } },
  })
  if (!user) return null
  return user
}

export const AUTH_COOKIE_NAME = COOKIE_NAME
