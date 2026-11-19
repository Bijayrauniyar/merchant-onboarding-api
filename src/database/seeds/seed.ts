import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { User } from '../../modules/users/entities/user.entity';
import { UserRole } from '../../modules/users/enums/user-role.enum';

interface SeedAccount {
  email: string;
  role: UserRole;
  password: string;
}

const SEED_ACCOUNTS: SeedAccount[] = [
  {
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    password: 'Password123!',
  },
  {
    email: 'reviewer1@example.com',
    role: UserRole.REVIEWER,
    password: 'Password123!',
  },
  {
    email: 'reviewer2@example.com',
    role: UserRole.REVIEWER,
    password: 'Password123!',
  },
  {
    email: 'sales1@example.com',
    role: UserRole.SALES,
    password: 'Password123!',
  },
  {
    email: 'sales2@example.com',
    role: UserRole.SALES,
    password: 'Password123!',
  },
];

async function seed() {
  console.log('--- Starting Database Seeder ---');

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const userRepository = dataSource.getRepository(User);
  const saltRounds = 10;

  let createdCount = 0;
  let skippedCount = 0;

  for (const account of SEED_ACCOUNTS) {
    const normalizedEmail = account.email.toLowerCase().trim();

    // Check if user already exists to ensure idempotency
    const existingUser = await userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      console.log(`[SKIP] User already exists: ${normalizedEmail} (${existingUser.role})`);
      skippedCount++;
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, saltRounds);

    const user = userRepository.create({
      email: normalizedEmail,
      passwordHash,
      role: account.role,
    });

    await userRepository.save(user);
    console.log(`[CREATED] User provisioned: ${normalizedEmail} (${account.role})`);
    createdCount++;
  }

  console.log(`--- Seeding Complete: ${createdCount} created, ${skippedCount} skipped ---`);
}

seed()
  .catch((error) => {
    console.error('Seeding failed with error:', error);
    process.exit(1);
  })
  .finally(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });
