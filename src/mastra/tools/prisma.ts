import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const url = process.env.PULSE_DATABASE_URL ?? 'file:./pulse.db'
const adapter = new PrismaBetterSqlite3({ url })

export const prisma = new PrismaClient({ adapter })
