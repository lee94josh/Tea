/**
 * Multimodal embeddings — used (in v2) to split time-contiguous blocks into
 * distinct sub-events, and generally to give moments a vector handle. We embed
 * the vision derivative in the unified text+image space.
 *
 * The stored vector dimension (migration `vector(N)`) must equal EMBED_DIM.
 *
 * NOTE: embeddings are a v2 nicety here (sub-event splitting); the MVP pipeline
 * clusters on time/distance and runs fine without them. The default
 * `gemini-embedding-001` is a TEXT embedding model — for true multimodal image
 * embeddings, point GEMINI_EMBED_MODEL at the Vertex `multimodalembedding@001`
 * model (1408-dim, hence the EMBED_DIM default) and adjust the call accordingly.
 * The interface stays the same regardless.
 */

import { GoogleGenAI } from '@google/genai';
import { env } from '../env';

export interface EmbeddingClient {
  embedImage(bytes: Buffer, mimeType: string): Promise<number[]>;
}

export class GeminiEmbeddings implements EmbeddingClient {
  private ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });

  async embedImage(bytes: Buffer, mimeType: string): Promise<number[]> {
    const res = await this.ai.models.embedContent({
      model: env.gemini.embedModel,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: bytes.toString('base64') } }],
        },
      ],
      config: { outputDimensionality: env.gemini.embedDim },
    });

    const values = res.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error('Embedding response contained no values');
    }
    if (values.length !== env.gemini.embedDim) {
      throw new Error(
        `Embedding dim ${values.length} != EMBED_DIM ${env.gemini.embedDim} (check migration vector(N))`,
      );
    }
    return values;
  }
}

let _emb: EmbeddingClient | null = null;
export function embeddings(): EmbeddingClient {
  if (!_emb) _emb = new GeminiEmbeddings();
  return _emb;
}
