import { PrismaClient, EmailProviderKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Settings — single-row config (upsert to keep seed idempotent)
  // -------------------------------------------------------------------------
  await prisma.settings.upsert({
    where: { id: 'settings-singleton' },
    update: {},
    create: {
      id: 'settings-singleton',
      autoSendEnabled: false,
      sendDayOfWeek: 'Thursday',
      sendTime: '09:00',
      timezone: 'Europe/Istanbul',
      activeProvider: EmailProviderKind.acs_email,
      pipelineLeadDays: 2,
      fromAddress: 'bulten@example.com',
      replyTo: 'iletisim@example.com',
    },
  });

  // -------------------------------------------------------------------------
  // Sample subscribers — clearly fake example.com addresses (idempotent)
  // -------------------------------------------------------------------------
  const subscribers = [
    {
      email: 'ahmet.yilmaz@example.com',
      displayName: 'Ahmet Yılmaz',
      company: 'Örnek A.Ş.',
    },
    {
      email: 'fatma.kaya@example.com',
      displayName: 'Fatma Kaya',
      company: 'Demo Teknoloji',
    },
    {
      email: 'mehmet.demir@example.com',
      displayName: 'Mehmet Demir',
      company: null,
    },
  ];

  for (const sub of subscribers) {
    await prisma.subscriber.upsert({
      where: { email: sub.email },
      update: {},
      create: {
        ...sub,
        unsubscribeToken: randomUUID(),
        status: 'active',
        locale: 'tr-TR',
        source: 'manual',
      },
    });
  }

  console.log('Seed complete: 1 Settings row + 3 sample subscribers upserted.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
