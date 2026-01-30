import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return buf.toString('hex') + '.' + salt;
}

async function main() {
  const email = process.argv[2] || 'emma@growthlabs.com';
  const newPassword = process.argv[3] || 'Test1234!';

  const hashed = await hashPassword(newPassword);

  const updated = await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.username, email))
    .returning();

  if (updated.length > 0) {
    console.log('Password reset for ' + email);
    console.log('New password: ' + newPassword);
  } else {
    console.error('User ' + email + ' not found');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
