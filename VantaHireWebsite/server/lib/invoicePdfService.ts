import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { Storage } from '@google-cloud/storage';
import { InvoiceData, generateInvoiceData, updatePaymentTransaction } from './invoiceService';
import { db } from '../db';
import { paymentTransactions } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Configuration
const USE_GCS = process.env.GCS_BUCKET_NAME && process.env.GOOGLE_APPLICATION_CREDENTIALS;
const GCS_BUCKET = process.env.GCS_BUCKET_NAME || '';
const LOCAL_INVOICE_DIR = path.join(process.cwd(), 'invoices');

// Ensure local directory exists
if (!USE_GCS && !fs.existsSync(LOCAL_INVOICE_DIR)) {
  fs.mkdirSync(LOCAL_INVOICE_DIR, { recursive: true });
}

// Initialize GCS client if configured
let storage: Storage | null = null;
if (USE_GCS) {
  storage = new Storage();
}

/**
 * Format currency in INR
 */
function formatINR(amountInPaise: number): string {
  const rupees = amountInPaise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Generate invoice PDF and return the file path or URL
 */
export async function generateInvoicePdf(invoiceData: InvoiceData): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);

    // Header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('TAX INVOICE', { align: 'center' })
      .moveDown(0.5);

    // Invoice details
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Invoice Number: ${invoiceData.invoiceNumber}`, { align: 'right' })
      .text(`Date: ${invoiceData.invoiceDate.toLocaleDateString('en-IN')}`, { align: 'right' })
      .text(`Due Date: ${invoiceData.dueDate.toLocaleDateString('en-IN')}`, { align: 'right' })
      .moveDown(1);

    // Seller info
    doc
      .font('Helvetica-Bold')
      .text('From:', { continued: false })
      .font('Helvetica')
      .text(invoiceData.sellerName)
      .text(invoiceData.sellerAddress || '')
      .text(`State: ${invoiceData.sellerState}`);

    if (invoiceData.sellerGstin) {
      doc.text(`GSTIN: ${invoiceData.sellerGstin}`);
    }
    doc.moveDown(1);

    // Buyer info
    doc
      .font('Helvetica-Bold')
      .text('Bill To:', { continued: false })
      .font('Helvetica')
      .text(invoiceData.buyerName);

    if (invoiceData.buyerAddress) {
      doc.text(invoiceData.buyerAddress);
    }
    if (invoiceData.buyerState) {
      doc.text(`State: ${invoiceData.buyerState}`);
    }
    if (invoiceData.buyerGstin) {
      doc.text(`GSTIN: ${invoiceData.buyerGstin}`);
    }
    doc.moveDown(1.5);

    // Table header
    const tableTop = doc.y;
    const tableLeft = 50;
    const col1 = 250;
    const col2 = 60;
    const col3 = 90;
    const col4 = 95;

    doc
      .font('Helvetica-Bold')
      .fontSize(10);

    // Draw header background
    doc
      .rect(tableLeft, tableTop - 5, 495, 20)
      .fill('#f0f0f0')
      .fillColor('black');

    doc
      .text('Description', tableLeft + 5, tableTop, { width: col1 })
      .text('Qty', tableLeft + col1 + 5, tableTop, { width: col2 })
      .text('Unit Price', tableLeft + col1 + col2 + 5, tableTop, { width: col3 })
      .text('Amount', tableLeft + col1 + col2 + col3 + 5, tableTop, { width: col4, align: 'right' });

    // Table rows
    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(10);

    for (const item of invoiceData.lineItems) {
      doc
        .text(item.description, tableLeft + 5, y, { width: col1 })
        .text(item.quantity.toString(), tableLeft + col1 + 5, y, { width: col2 })
        .text(formatINR(item.unitPrice), tableLeft + col1 + col2 + 5, y, { width: col3 })
        .text(formatINR(item.amount), tableLeft + col1 + col2 + col3 + 5, y, { width: col4, align: 'right' });
      y += 20;
    }

    // Draw line
    y += 10;
    doc
      .moveTo(tableLeft, y)
      .lineTo(545, y)
      .stroke();

    // Totals
    y += 15;
    const totalsLeft = 350;

    doc.text('Subtotal:', totalsLeft, y, { width: 100 });
    doc.text(formatINR(invoiceData.subtotal), totalsLeft + 100, y, { width: 95, align: 'right' });
    y += 18;

    // GST breakdown
    if (invoiceData.cgst > 0) {
      doc.text('CGST (9%):', totalsLeft, y, { width: 100 });
      doc.text(formatINR(invoiceData.cgst), totalsLeft + 100, y, { width: 95, align: 'right' });
      y += 18;

      doc.text('SGST (9%):', totalsLeft, y, { width: 100 });
      doc.text(formatINR(invoiceData.sgst), totalsLeft + 100, y, { width: 95, align: 'right' });
      y += 18;
    } else if (invoiceData.igst > 0) {
      doc.text('IGST (18%):', totalsLeft, y, { width: 100 });
      doc.text(formatINR(invoiceData.igst), totalsLeft + 100, y, { width: 95, align: 'right' });
      y += 18;
    }

    // Total
    y += 5;
    doc.font('Helvetica-Bold');
    doc.text('Total:', totalsLeft, y, { width: 100 });
    doc.text(formatINR(invoiceData.totalAmount), totalsLeft + 100, y, { width: 95, align: 'right' });

    // Payment info
    if (invoiceData.paymentMethod || invoiceData.paymentId) {
      y += 40;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Payment Information:', 50, y)
        .font('Helvetica');
      y += 15;

      if (invoiceData.paymentMethod) {
        doc.text(`Method: ${invoiceData.paymentMethod}`, 50, y);
        y += 15;
      }
      if (invoiceData.paymentId) {
        doc.text(`Transaction ID: ${invoiceData.paymentId}`, 50, y);
      }
    }

    // Footer
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        'This is a computer-generated invoice and does not require a signature.',
        50,
        doc.page.height - 50,
        { align: 'center', width: 495 }
      );

    doc.end();

    // Handle PDF data
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const fileName = `${invoiceData.invoiceNumber}.pdf`;

      try {
        if (USE_GCS && storage) {
          // Upload to GCS
          const bucket = storage.bucket(GCS_BUCKET);
          const file = bucket.file(`invoices/${fileName}`);

          await file.save(pdfBuffer, {
            metadata: {
              contentType: 'application/pdf',
              cacheControl: 'public, max-age=31536000',
            },
          });

          // Make publicly accessible or generate signed URL
          const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
          });

          resolve(url);
        } else {
          // Save locally
          const filePath = path.join(LOCAL_INVOICE_DIR, fileName);
          fs.writeFileSync(filePath, pdfBuffer);

          // Return relative path for API serving
          resolve(`/api/invoices/${fileName}`);
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Generate and store invoice PDF for a transaction
 */
export async function generateAndStoreInvoicePdf(transactionId: number): Promise<string | null> {
  // Get invoice data
  const invoiceData = await generateInvoiceData(transactionId);
  if (!invoiceData) {
    console.log(`Cannot generate invoice for transaction ${transactionId}: not completed or not found`);
    return null;
  }

  try {
    // Generate PDF
    const invoiceUrl = await generateInvoicePdf(invoiceData);

    // Update transaction with invoice URL
    await updatePaymentTransaction(transactionId, {
      invoiceUrl,
    });

    return invoiceUrl;
  } catch (error) {
    console.error(`Failed to generate invoice PDF for transaction ${transactionId}:`, error);
    return null;
  }
}

/**
 * Get invoice PDF file path for local serving
 */
export function getLocalInvoicePath(fileName: string): string | null {
  const filePath = path.join(LOCAL_INVOICE_DIR, fileName);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * Check if invoice file exists
 */
export async function invoiceExists(transactionId: number): Promise<boolean> {
  const transaction = await db.query.paymentTransactions.findFirst({
    where: eq(paymentTransactions.id, transactionId),
  });

  if (!transaction?.invoiceUrl) {
    return false;
  }

  if (USE_GCS) {
    // For GCS, assume it exists if URL is set
    return true;
  }

  // For local, check file existence
  const fileName = transaction.invoiceNumber ? `${transaction.invoiceNumber}.pdf` : null;
  if (!fileName) return false;

  return fs.existsSync(path.join(LOCAL_INVOICE_DIR, fileName));
}
