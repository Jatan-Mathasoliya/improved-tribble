import { describe, expect, it } from 'vitest';

import { describeBulkFailures } from '@/lib/bulk-action-failures';

describe('describeBulkFailures', () => {
  it('maps application ids to candidate names and includes error reasons', () => {
    const result = describeBulkFailures(
      [
        { applicationId: 101, error: 'Email bounced' },
        { applicationId: 102, error: 'Internal server error' },
      ],
      [
        { id: 101, name: 'Alice Johnson', email: 'alice@example.com' },
        { id: 102, name: null, email: 'bob@example.com' },
      ],
    );

    expect(result).toBe('Alice Johnson (Email bounced), bob@example.com (Internal server error)');
  });

  it('falls back to the provided label and truncates after three failures', () => {
    const result = describeBulkFailures(
      [
        { applicationId: 201 },
        { applicationId: 202, error: 'Missing template' },
        { applicationId: 203 },
        { applicationId: 204 },
      ],
      [
        { id: 201, name: 'Neha Gupta' },
        { id: 202, name: 'Omar Khan' },
        { id: 203, name: 'Priya Shah' },
      ],
      'application',
    );

    expect(result).toBe('Neha Gupta, Omar Khan (Missing template), Priya Shah and 1 more');
  });
});
