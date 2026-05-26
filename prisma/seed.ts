import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'admin@cutliteamerica.com'
/** Default bootstrap password — change after first prod login. Re-run `npm run db:seed` resets it. */
const ADMIN_PASSWORD = 'CutliteAdmin2026'

async function main() {
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12)

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: 'Admin',
      password: hashedPassword,
      role: 'admin',
    },
    update: {
      password: hashedPassword,
      name: 'Admin',
      role: 'admin',
    },
  })

  console.log(`Upserted admin user: ${ADMIN_EMAIL}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
