/**
 * ActiveKG Resume Text Chunker
 *
 * Splits resume text into overlapping chunks suitable for embedding.
 * Uses sentence-aware splitting to avoid breaking mid-sentence.
 * Generates deterministic external IDs for idempotent chunk creation.
 */

const MAX_CHUNK_CHARS = parseInt(process.env.ACTIVEKG_CHUNK_MAX_CHARS || '8000', 10);
const OVERLAP_CHARS = parseInt(process.env.ACTIVEKG_CHUNK_OVERLAP_CHARS || '500', 10);

export interface ChunkDescriptor {
  externalId: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
}

/**
 * Generate a deterministic external ID for a chunk.
 */
function generateChunkExternalId(parentExternalId: string, chunkIndex: number): string {
  return `${parentExternalId}#chunk${chunkIndex}`;
}

/**
 * Find the best split point near a target position.
 * Prefers sentence boundaries (., !, ?), then newlines, then spaces.
 */
function findSplitPoint(text: string, target: number, minPos: number): number {
  if (target >= text.length) return text.length;

  const searchStart = Math.max(minPos, target - 500);
  const searchRegion = text.slice(searchStart, target + 1);

  // Find last sentence-ending punctuation followed by whitespace
  let lastSentenceEnd = -1;
  const re = /[.!?]\s/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(searchRegion)) !== null) {
    lastSentenceEnd = match.index;
  }
  if (lastSentenceEnd !== -1) {
    return searchStart + lastSentenceEnd + 1;
  }

  // Fall back to newline boundary
  const lastNewline = text.lastIndexOf('\n', target);
  if (lastNewline > minPos) {
    return lastNewline + 1;
  }

  // Fall back to space boundary
  const lastSpace = text.lastIndexOf(' ', target);
  if (lastSpace > minPos) {
    return lastSpace + 1;
  }

  // Hard cut at target
  return target;
}

/**
 * Split text into overlapping chunks suitable for embedding.
 * Each chunk has a deterministic external ID based on the parent ID and index.
 */
export function chunkText(
  text: string,
  parentExternalId: string,
  maxChunkChars: number = MAX_CHUNK_CHARS,
  overlapChars: number = OVERLAP_CHARS
): ChunkDescriptor[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const trimmed = text.trim();

  // If text fits in one chunk, return a single chunk
  if (trimmed.length <= maxChunkChars) {
    return [{
      externalId: generateChunkExternalId(parentExternalId, 0),
      chunkIndex: 0,
      totalChunks: 1,
      text: trimmed,
    }];
  }

  const chunks: { text: string; startPos: number }[] = [];
  let pos = 0;

  while (pos < trimmed.length) {
    const end = Math.min(pos + maxChunkChars, trimmed.length);

    if (end === trimmed.length) {
      chunks.push({ text: trimmed.slice(pos), startPos: pos });
      break;
    }

    const splitAt = findSplitPoint(trimmed, end, pos);
    chunks.push({ text: trimmed.slice(pos, splitAt), startPos: pos });

    const nextPos = Math.max(splitAt - overlapChars, pos + 1);
    pos = nextPos >= splitAt ? splitAt : nextPos;
  }

  const totalChunks = chunks.length;
  return chunks.map((chunk, index) => ({
    externalId: generateChunkExternalId(parentExternalId, index),
    chunkIndex: index,
    totalChunks,
    text: chunk.text,
  }));
}

/**
 * Build the parent external ID for a VantaHire application resume.
 */
export function buildParentExternalId(orgId: number, applicationId: number): string {
  return `vantahire:org_${orgId}:application:${applicationId}:resume`;
}
