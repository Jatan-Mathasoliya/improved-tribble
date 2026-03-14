import { randomUUID } from 'crypto';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';

export interface GoogleVisionOcrResult {
  success: boolean;
  text: string;
  error?: string;
}

const OCR_POLL_INTERVAL_MS = parseInt(process.env.GOOGLE_VISION_OCR_POLL_INTERVAL_MS || '2000', 10);
const OCR_TIMEOUT_MS = parseInt(process.env.GOOGLE_VISION_OCR_TIMEOUT_MS || '60000', 10);

let storageClient: Storage | null = null;
let authClient: GoogleAuth | null = null;

function parseServiceAccountKey(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === 'string') {
      const nested = JSON.parse(parsed);
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested as Record<string, unknown>;
      }
    }
  } catch {
  }

  const normalized = raw.replace(/\\"/g, '"').replace(/\\n/g, '\n');
  const reparsed = JSON.parse(normalized);
  if (reparsed && typeof reparsed === 'object' && !Array.isArray(reparsed)) {
    return reparsed as Record<string, unknown>;
  }
  throw new Error('Unable to parse Google service account key');
}

function getGoogleCredentials(): Record<string, unknown> | null {
  const raw = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    return null;
  }

  try {
    return parseServiceAccountKey(raw);
  } catch (error) {
    console.error('[BULK_RESUME_IMPORT] Failed to parse Google service account key for OCR:', error);
    return null;
  }
}

function getStorageClient(): Storage | null {
  if (storageClient) {
    return storageClient;
  }

  const credentials = getGoogleCredentials();
  const projectId = process.env.GCS_PROJECT_ID;
  if (!credentials || !projectId) {
    return null;
  }

  storageClient = new Storage({ projectId, credentials });
  return storageClient;
}

function getGoogleAuth(): GoogleAuth | null {
  if (authClient) {
    return authClient;
  }

  const credentials = getGoogleCredentials();
  const projectId = process.env.GCS_PROJECT_ID;
  if (!credentials || !projectId) {
    return null;
  }

  authClient = new GoogleAuth({
    credentials,
    projectId,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return authClient;
}

function parseGcsPath(gcsPath: string): { bucket: string; path: string } {
  const match = gcsPath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error('Invalid GCS path format');
  }

  const [, bucket, path] = match;
  if (!bucket || !path) {
    throw new Error('Invalid GCS path components');
  }

  return { bucket, path };
}

function getMimeTypeFromFilename(filename: string): string | null {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    case 'gif':
      return 'image/gif';
    default:
      return null;
  }
}

async function getAccessToken(): Promise<string> {
  const auth = getGoogleAuth();
  if (!auth) {
    throw new Error('Google Vision OCR auth not configured');
  }

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error('Unable to acquire Google access token for OCR');
  }
  return token;
}

async function pollOperation(operationName: string, accessToken: string): Promise<void> {
  const deadline = Date.now() + OCR_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(`https://vision.googleapis.com/v1/${operationName}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Vision OCR operation poll failed: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as { done?: boolean; error?: { message?: string } };
    if (payload.done) {
      if (payload.error?.message) {
        throw new Error(`Google Vision OCR failed: ${payload.error.message}`);
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, OCR_POLL_INTERVAL_MS));
  }

  throw new Error('Google Vision OCR timed out');
}

async function readVisionOutput(outputPrefix: string): Promise<string> {
  const storage = getStorageClient();
  if (!storage) {
    throw new Error('Google Cloud Storage not configured for OCR output');
  }

  const { bucket, path } = parseGcsPath(outputPrefix);
  const [files] = await storage.bucket(bucket).getFiles({ prefix: path });
  const jsonFiles = files.filter((file) => file.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name));

  if (jsonFiles.length === 0) {
    throw new Error('Google Vision OCR produced no output files');
  }

  const chunks: string[] = [];
  for (const file of jsonFiles) {
    const [buffer] = await file.download();
    const parsed = JSON.parse(buffer.toString('utf8')) as {
      responses?: Array<{ fullTextAnnotation?: { text?: string } }>;
    };
    for (const response of parsed.responses ?? []) {
      const text = response.fullTextAnnotation?.text?.trim();
      if (text) {
        chunks.push(text);
      }
    }
  }

  return chunks.join('\n\n').trim();
}

async function cleanupVisionOutput(outputPrefix: string): Promise<void> {
  const storage = getStorageClient();
  if (!storage) {
    return;
  }

  try {
    const { bucket, path } = parseGcsPath(outputPrefix);
    await storage.bucket(bucket).deleteFiles({ prefix: path, force: true });
  } catch (error) {
    console.warn('[BULK_RESUME_IMPORT] Failed to clean up Google Vision OCR output:', error);
  }
}

export function isGoogleVisionOcrEnabled(): boolean {
  return process.env.GOOGLE_VISION_OCR_ENABLED === 'true';
}

export function isGoogleVisionOcrConfigured(): boolean {
  return Boolean(process.env.GCS_PROJECT_ID && process.env.GCS_BUCKET_NAME && process.env.GCS_SERVICE_ACCOUNT_KEY);
}

export async function extractTextWithGoogleVisionOcr(
  _buffer: Buffer,
  filename: string,
  gcsPath?: string | null,
): Promise<GoogleVisionOcrResult> {
  if (!isGoogleVisionOcrEnabled()) {
    return {
      success: false,
      text: '',
      error: 'Google Vision OCR disabled',
    };
  }

  if (!isGoogleVisionOcrConfigured()) {
    return {
      success: false,
      text: '',
      error: 'Google Vision OCR not configured',
    };
  }

  const mimeType = getMimeTypeFromFilename(filename);
  if (!mimeType || mimeType !== 'application/pdf') {
    return {
      success: false,
      text: '',
      error: 'Google Vision OCR currently supports PDF bulk import files only',
    };
  }

  if (!gcsPath) {
    return {
      success: false,
      text: '',
      error: 'Google Vision OCR requires a GCS-backed file path',
    };
  }

  const bucketName = process.env.GCS_BUCKET_NAME!;
  const outputPrefix = `gs://${bucketName}/resume-import-ocr/${randomUUID()}/`;

  try {
    const accessToken = await getAccessToken();
    const response = await fetch('https://vision.googleapis.com/v1/files:asyncBatchAnnotate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            inputConfig: {
              gcsSource: { uri: gcsPath },
              mimeType,
            },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            outputConfig: {
              gcsDestination: { uri: outputPrefix },
              batchSize: 20,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        text: '',
        error: `Google Vision OCR request failed: ${response.status} ${await response.text()}`,
      };
    }

    const payload = await response.json() as { name?: string };
    if (!payload.name) {
      return {
        success: false,
        text: '',
        error: 'Google Vision OCR did not return an operation name',
      };
    }

    await pollOperation(payload.name, accessToken);
    const text = await readVisionOutput(outputPrefix);
    if (!text) {
      return {
        success: false,
        text: '',
        error: 'Google Vision OCR returned no text',
      };
    }

    return {
      success: true,
      text,
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await cleanupVisionOutput(outputPrefix);
  }
}
