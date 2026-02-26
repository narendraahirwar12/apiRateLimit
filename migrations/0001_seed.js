require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing users
  await User.deleteMany({});

  const users = [
    { username: 'admin_user', email: 'admin@example.com', password: 'Admin@123', role: 'admin' },
    { username: 'paid_user', email: 'paid@example.com', password: 'Paid@1234', role: 'paid' },
    { username: 'free_user', email: 'free@example.com', password: 'Free@1234', role: 'free' },
    { username: 'tenant_user', email: 'tenant@example.com', password: 'Tenant@123', role: 'paid', tenantId: 'tenant-001' },
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
