// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirstMock = vi.fn();

vi.mock('../db', () => ({
  db: {
    query: {
      paymentTransactions: {
        findFirst: findFirstMock,
      },
    },
  },
}));

describe('invoice data credit impact copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GST_RATE = '0';
  });

  it('includes prorated seat credits in seat-add invoice data', async () => {
    const { generateInvoiceData } = await import('../lib/invoiceService');

    findFirstMock.mockResolvedValue({
      id: 10,
      status: 'completed',
      type: 'seat_addition',
      amount: 99900,
      totalAmount: 99900,
      taxAmount: 0,
      invoiceNumber: 'INV-1',
      completedAt: new Date('2026-03-18T10:00:00.000Z'),
      cashfreePaymentMethod: 'card',
      cashfreePaymentId: 'pay_123',
      metadata: {
        additionalSeats: 1,
        proratedCredits: 300,
      },
      organization: {
        id: 7,
        name: 'Acme Recruiting',
        billingName: null,
        gstin: null,
        billingAddress: null,
        billingCity: null,
        billingState: null,
        billingPincode: null,
      },
      subscription: {
        seats: 3,
        billingCycle: 'monthly',
        plan: {
          displayName: 'Growth',
        },
      },
    });

    const invoice = await generateInvoiceData(10);

    expect(invoice?.lineItems[0]?.description).toContain('+300 included AI credits this cycle');
    expect(invoice?.notes).toContain(
      '300 prorated included AI credits were added to the shared organization pool for the current monthly credit cycle.',
    );
  });

  it('includes purchased credit impact in credit-pack invoice data', async () => {
    const { generateInvoiceData } = await import('../lib/invoiceService');

    findFirstMock.mockResolvedValue({
      id: 11,
      status: 'completed',
      type: 'credit_pack',
      amount: 199800,
      totalAmount: 199800,
      taxAmount: 0,
      invoiceNumber: 'INV-2',
      completedAt: new Date('2026-03-18T11:00:00.000Z'),
      cashfreePaymentMethod: 'upi',
      cashfreePaymentId: 'pay_456',
      metadata: {
        quantity: 2,
        credits: 600,
      },
      organization: {
        id: 7,
        name: 'Acme Recruiting',
        billingName: null,
        gstin: null,
        billingAddress: null,
        billingCity: null,
        billingState: null,
        billingPincode: null,
      },
      subscription: null,
    });

    const invoice = await generateInvoiceData(11);

    expect(invoice?.lineItems[0]?.description).toContain('(600 credits added)');
    expect(invoice?.notes).toContain('600 purchased AI credits were added to the shared organization credit pool.');
    expect(invoice?.notes).toContain('Included monthly credits are consumed before purchased credits.');
  });
});
