export interface MistralOcrResult {
  success: boolean;
  text: string;
  error?: string;
}

export function isMistralOcrEnabled(): boolean {
  return process.env.MISTRAL_OCR_ENABLED === 'true';
}

export function isMistralOcrConfigured(): boolean {
  return Boolean(process.env.MISTRAL_OCR_API_KEY);
}

export async function extractTextWithMistralOcr(
  _buffer: Buffer,
  _filename: string,
): Promise<MistralOcrResult> {
  if (!isMistralOcrEnabled()) {
    return {
      success: false,
      text: '',
      error: 'Mistral OCR disabled',
    };
  }

  if (!isMistralOcrConfigured()) {
    return {
      success: false,
      text: '',
      error: 'Mistral OCR API key not configured',
    };
  }

  return {
    success: false,
    text: '',
    error: 'Mistral OCR provider interface is enabled but not implemented in this environment',
  };
}
