/**
 * Setup file for integration tests (Node environment)
 *
 * Unlike test/setup.ts which is for browser-like tests (jsdom),
 * this setup is for Node.js integration tests that test the actual API.
 */

// IMPORTANT: Set environment variables BEFORE any imports to ensure modules
// that read env at load time (e.g., featureGating.ts) get the correct values.
process.env.NODE_ENV = 'development';
process.env.INSTANCE_TYPE = 'multi_tenant';
process.env.DISABLE_SUPER_ADMIN = 'false';
process.env.DISABLE_MULTI_ORG_VIEW = 'false';
process.env.DISABLE_PLATFORM_ANALYTICS = 'false';

import { expect, afterEach } from 'vitest';
import { config } from 'dotenv';

// Load environment variables from .env
config();
