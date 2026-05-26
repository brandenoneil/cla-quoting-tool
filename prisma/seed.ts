import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const existingUser = await prisma.user.findFirst()
  if (existingUser) {
    console.log('Database already seeded, skipping.')
    return
  }

  const hashedPassword = await bcrypt.hash('CutliteAdmin2026', 12)

  await prisma.user.create({
    data: {
      email: 'admin@cutliteamerica.com',
      name: 'Admin',
      password: hashedPassword,
      role: 'admin',
    },
  })

  console.log('Seeded admin user: admin@cutliteamerica.com')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
