
import crypto from 'crypto';

const password = process.argv[2];

if (!password) {
    console.error("Usage: node generate-hash.js <your-password>");
    process.exit(1);
}

// Generate a random salt
const salt = crypto.randomBytes(16).toString('hex');

// Hash the password with the salt using scrypt (secure against rainbow tables / brute force)
const hash = crypto.scryptSync(password, salt, 64).toString('hex');

// Output format: salt:hash
console.log(`\nAdd this to your .env file:\nBASIC_AUTH_HASH=${salt}:${hash}\n`);
console.log(`(Do not set BASIC_AUTH_PASSWORD anymore)`);
