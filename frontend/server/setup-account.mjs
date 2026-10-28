import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { passwordHash } from './project-provider.mjs';

const [email, customerId] = process.argv.slice(2);
if (
  !email ||
  !customerId ||
  customerId.startsWith('DEMO-') ||
  !/^CUST-[A-Za-z0-9-]+$/.test(customerId) ||
  /[\r\n]/.test(email)
) {
  console.error('Usage: npm run setup:account -- you@example.com CUST-001');
  process.exit(1);
}
if (
  existsSync(new URL('../.portal.env', import.meta.url)) ||
  existsSync(new URL('../.portal-password', import.meta.url))
) {
  console.error('A local portal account file already exists; no files were overwritten.');
  process.exit(1);
}
// A private personal login, not a Cognito account and not a DynamoDB customer write.
const password = randomBytes(24).toString('base64url');
const settings = `PORTAL_LOGIN_EMAIL=${JSON.stringify(email)}\nPORTAL_CUSTOMER_ID=${customerId}\nPORTAL_PASSWORD_HASH=${passwordHash(password)}\n`;
writeFileSync(new URL('../.portal.env', import.meta.url), settings, { mode: 0o600, flag: 'wx' });
writeFileSync(new URL('../.portal-password', import.meta.url), password + '\n', {
  mode: 0o600,
  flag: 'wx',
});
console.log(
  'Private local account created. Read frontend/.portal-password locally for your generated password. Both files are gitignored. No AWS APIs were called.',
);
