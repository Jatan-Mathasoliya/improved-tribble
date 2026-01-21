/**
 * Setup file for integration tests (Node environment)
 *
 * Unlike test/setup.ts which is for browser-like tests (jsdom),
 * this setup is for Node.js integration tests that test the actual API.
 */

// Set NODE_ENV before any imports to ensure CSRF and other modules
// use development settings (e.g., non-secure cookies for supertest)
process.env.NODE_ENV = 'development';

import { expect, afterEach } from 'vitest';
import { config } from 'dotenv';

// Load environment variables from .env
config();
