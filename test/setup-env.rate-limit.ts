import { config } from 'dotenv';

config({ path: '.env.test' });

process.env.RATE_LIMIT_LOGIN_LIMIT = '5';
process.env.RATE_LIMIT_LOGIN_TTL_MS = '60000';
process.env.RATE_LIMIT_REGISTER_LIMIT = '3';
process.env.RATE_LIMIT_REGISTER_TTL_MS = String(60 * 60 * 1000);
