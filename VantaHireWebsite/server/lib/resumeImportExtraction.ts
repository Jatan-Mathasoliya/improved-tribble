import { extractResumeText, extractResumeTextRaw, stripPII, validateResumeText } from './resumeExtractor';
import { extractTextWithGoogleVisionOcr } from './googleVisionOcrClient';

export type ResumeImportExtractionMethod = 'native_text' | 'google_vision_ocr' | 'failed';

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
  options?: { gcsPath?: string | null },
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

  const ocrResult = await extractTextWithGoogleVisionOcr(buffer, filename, options?.gcsPath);
  if (ocrResult.success && validateResumeText(ocrResult.text)) {
    return {
      success: true,
      text: stripPII(ocrResult.text),
      rawText: ocrResult.text,
      method: 'google_vision_ocr',
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
