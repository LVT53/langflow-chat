import { db } from '../src/lib/server/db/index.js';
import { users } from '../src/lib/server/db/schema.js';
import bcrypt from 'bcryptjs';

async function main() {
  const id = 'test';
  const email = 'test_id@example.com';
  const name = 'Test User';
  const passwordHash = bcrypt.hashSync('password', 10);

  try {
    await db.insert(users).values({
      id,
      email,
      name,
      passwordHash,
    });
    console.log('Test user created');
  } catch (err: any) {
    console.error(err);
  }
}
main();
