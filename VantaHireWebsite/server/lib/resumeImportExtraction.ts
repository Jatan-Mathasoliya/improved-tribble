import { extractResumeText, extractResumeTextRaw, stripPII, validateResumeText } from './resumeExtractor';
import { extractTextWithMistralOcr } from './mistralOcrClient';

export type ResumeImportExtractionMethod = 'native_text' | 'mistral_ocr' | 'failed';

export interface ResumeImportExtractionResult {
  success: boolean;
  text: string;
  rawText: string;
  method: ResumeImportExtractionMethod;
  error?: string;
}

export async function extractResumeTextWithFallback(
  buffer: Buffer,
  filename: string,
): Promise<ResumeImportExtractionResult> {
  const normalizedExtraction = await extractResumeText(buffer);
  const rawExtraction = await extractResumeTextRaw(buffer);

  if (
    normalizedExtraction.success &&
    rawExtraction.success &&
    validateResumeText(rawExtraction.text)
  ) {
    return {
      success: true,
      text: normalizedExtraction.text,
      rawText: rawExtraction.text,
      method: 'native_text',
    };
  }

  const ocrResult = await extractTextWithMistralOcr(buffer, filename);
  if (ocrResult.success && validateResumeText(ocrResult.text)) {
    return {
      success: true,
      text: stripPII(ocrResult.text),
      rawText: ocrResult.text,
      method: 'mistral_ocr',
    };
  }

  return {
    success: false,
    text: normalizedExtraction.success ? normalizedExtraction.text : '',
    rawText: rawExtraction.success ? rawExtraction.text : '',
    method: 'failed',
    error: ocrResult.error || normalizedExtraction.error || rawExtraction.error || 'Resume extraction failed',
  };
}
