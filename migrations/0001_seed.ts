import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  await User.deleteMany({});

  const users = [
    { username: 'admin_user', email: 'admin@example.com', password: 'Admin@123', role: 'admin' as const },
    { username: 'paid_user', email: 'paid@example.com', password: 'Paid@1234', role: 'paid' as const },
    { username: 'free_user', email: 'free@example.com', password: 'Free@1234', role: 'free' as const },
    { username: 'tenant_user', email: 'tenant@example.com', password: 'Tenant@123', role: 'paid' as const, tenantId: 'tenant-001' },
  ];

  for (const u of users) {
    await User.create(u);
    console.log(`✅ Created: ${u.username} (${u.role})`);
  }

  console.log('\n🎉 Seed complete! Test credentials:');
  console.log('  Admin: admin@example.com / Admin@123');
  console.log('  Paid:  paid@example.com  / Paid@1234');
  console.log('  Free:  free@example.com  / Free@1234');

  await mongoose.disconnect();
}

seed().catch(console.error);
