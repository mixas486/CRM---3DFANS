import { GoogleGenAI } from "@google/genai";
import { logger } from "../logging/logger";
import { uploadToGCS } from "../storage/uploadToGCS";
import axios from 'axios';

const TAG = 'PREVIEW';

/**
 * Normalizes the media URL to handle local/docker/cloud run environments correctly.
 * Specifically corrects protocol issues like invalid HTTPS on internal networks.
 */
export function normalizeMediaUrl(url: string): string {
  if (!url) return '';
  
  let normalized = url;

  // 1. Correct common internal protocol errors (HTTPS to HTTP for internal docker)
  if (normalized.includes('host.docker.internal') || normalized.includes('localhost')) {
    normalized = normalized.replace('https://', 'http://');
    logger.info(TAG, `Internal network detected, forced HTTP: ${normalized}`);
  }

  logger.info(TAG, `Media URL normalized: ${normalized}`);
  return normalized;
}

/**
 * Builds the strictly detailed prompt for Gemini Flash Image.
 * @param imageDescription - Physical description from vision analysis
 * @param customerDescription - Optional customization requested by the customer
 */
export function buildMiniaturePrompt(imageDescription: string, customerDescription?: string): string {
  const customizationBlock = customerDescription
    ? `\nCustomer Special Requests: ${customerDescription}\nIncorporate these customizations faithfully into the figurine design.`
    : '';

  return `Transform this subject into a premium collectible 3D figurine.

Reference Image Analysis: ${imageDescription}${customizationBlock}

Preserve strictly:
- exact facial identity and features from the reference photo
- hairstyle and hair color
- facial expression
- clothing details and colors
- body pose and stance

Figurine Style:
- Disney Pixar inspired high-end collectible
- premium collectible toy aesthetic
- ultra detailed painted resin material
- cinematic studio lighting
- shallow depth of field (bokeh)
- realistic handcrafted sculpt
- professional product photography

Base:
- premium circular or cylindrical display pedestal

Negative Prompt:
- low quality, blurry, deformed hands, bad anatomy, distorted face, extra fingers, watermark, text, ugly, mutated, low detail, bad eyes, cropped

high realism, 8k resolution, premium product render quality`;
}

/**
 * Orchestrates Gemini Image Generation with automatic model fallback.
 * @param source       - Buffer or public URL of the reference image
 * @param retries      - Download retry attempts when source is a URL
 * @param customerDescription - Optional customization text from the customer
 */
export async function generatePreviewImage(
  source: string | Buffer,
  retries: number = 2,
  customerDescription?: string,
): Promise<string> {
  logger.info(TAG, 'Starting Gemini generation', { hasCustomerDescription: !!customerDescription });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error(TAG, 'GEMINI_API_KEY is not defined');
    throw new Error('Missing Gemini API Configuration');
  }

  // Use options object — required by @google/genai
  const genAI = new GoogleGenAI({ apiKey });

  const models = [
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.5-flash-preview-05-20',
  ];

  // --- Resolve reference image buffer ---
  let referenceBuffer: Buffer;

  if (Buffer.isBuffer(source)) {
    referenceBuffer = source;
    logger.info(TAG, 'Using provided buffer directly');
  } else {
    const normalizedUrl = normalizeMediaUrl(source);
    let downloadedBuffer: Buffer | null = null;

    for (let i = 0; i <= retries; i++) {
      try {
        logger.info(TAG, `Downloading reference image (attempt ${i + 1})`);
        const response = await axios.get(normalizedUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxRedirects: 5,
          headers: { Accept: 'image/*' },
        });
        downloadedBuffer = Buffer.from(response.data);
        logger.info(TAG, 'Download success');
        break;
      } catch (err: any) {
        logger.error(TAG, `Download failed (attempt ${i + 1})`, err.message);
        if (i === retries) throw new Error(`Reference image inaccessible: ${err.message}`);
        await new Promise(res => setTimeout(res, 2000 * (i + 1)));
      }
    }

    if (!downloadedBuffer) throw new Error('Failed to retrieve reference image buffer');
    referenceBuffer = downloadedBuffer;
  }

  // --- Build prompt (include customer description if provided) ---
  const prompt = buildMiniaturePrompt('The subject in the provided reference photo', customerDescription);
  logger.info(TAG, 'Prompt built', { customerDescription: customerDescription || '(none)' });

  // --- Generate with model fallback ---
  let imageBuffer: Buffer | null = null;

  for (const modelName of models) {
    try {
      logger.info(TAG, `Trying model: ${modelName}`);

      const result = await (genAI.models.generateContent as any)({
        model: modelName,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: referenceBuffer.toString('base64'),
                  mimeType: 'image/jpeg',
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseModalities: ['image', 'text'],
          temperature: 1.0,
        },
      });

      // Walk the response parts looking for image data
      const candidates: any[] = (result as any)?.candidates ?? [];
      outer: for (const candidate of candidates) {
        for (const part of candidate?.content?.parts ?? []) {
          if (part?.inlineData?.data) {
            imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            logger.info(TAG, `Image generated via ${modelName}`);
            break outer;
          }
        }
      }

      if (imageBuffer) break;
      logger.warn(TAG, `${modelName} returned no image data`);
    } catch (err) {
      logger.error(TAG, `Model ${modelName} failed`, err);
    }
  }

  if (!imageBuffer) {
    logger.error(TAG, 'All Gemini models failed');
    throw new Error('Gemini generation failed across all models');
  }

  // --- Upload to GCS ---
  try {
    const destination = `previews/miniature_${Date.now()}.png`;
    const publicUrl = await uploadToGCS(imageBuffer, destination);
    logger.info(TAG, 'Upload completed', { publicUrl });
    return publicUrl;
  } catch (err) {
    logger.error(TAG, 'GCS upload failed', err);
    throw new Error('Failed to persist generated preview');
  }
}
