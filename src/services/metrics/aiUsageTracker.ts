import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import { serverDb } from '../../server/firebase';
import { logger } from "../logging/logger";

const TAG = 'AI_USAGE';

export const USD_TO_BRL = 5.70;

// Preços por 1M tokens (USD) — atualize quando os provedores mudarem
const PRICING = {
  gemini:       { input: 0.075, output: 0.30 }, // gemini-2.5-flash
  openai:       { input: 0.15,  output: 0.60 }, // gpt-4o-mini
  dalle:        { perImage: 0.08 },              // dall-e-3 HD 1024x1024
  tts:          { perMillionChars: 15.00 },      // openai tts-1 ($15/1M chars)
  elevenlabs:   { perMillionChars: 300.00 },     // elevenlabs flash v2.5 (~$0.30/1K chars)
  whisper:      { perMinute: 0.006 },            // openai whisper-1 ($0.006/min)
  geminiImage:  { perImage: 0.0 },              // gemini image gen (free during preview)
} as const;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function calcCostUSD(provider: 'gemini' | 'openai', input: number, output: number): number {
  const p = PRICING[provider];
  return (input / 1_000_000) * p.input + (output / 1_000_000) * p.output;
}

export async function trackAIUsage(
  provider: 'gemini' | 'openai',
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  try {
    const date = todayStr();
    const costUSD = calcCostUSD(provider, inputTokens, outputTokens);
    const costBRL = costUSD * USD_TO_BRL;

    const ref = doc(serverDb, 'ai_usage_daily', date);
    await setDoc(ref, {
      date,
      [`${provider}_requests`]:     increment(1),
      [`${provider}_inputTokens`]:  increment(inputTokens),
      [`${provider}_outputTokens`]: increment(outputTokens),
      [`${provider}_costUSD`]:      increment(costUSD),
      totalCostUSD: increment(costUSD),
      totalCostBRL: increment(costBRL),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    logger.error(TAG, 'Failed to track AI usage', err);
  }
}

export async function trackDalleUsage(imageCount = 1): Promise<void> {
  try {
    const date = todayStr();
    const costUSD = PRICING.dalle.perImage * imageCount;
    const costBRL = costUSD * USD_TO_BRL;

    const ref = doc(serverDb, 'ai_usage_daily', date);
    await setDoc(ref, {
      date,
      dalle_images:  increment(imageCount),
      dalle_costUSD: increment(costUSD),
      totalCostUSD:  increment(costUSD),
      totalCostBRL:  increment(costBRL),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    logger.error(TAG, 'Failed to track DALL-E usage', err);
  }
}

/** Track OpenAI TTS-1 usage by character count. */
export async function trackTTSUsage(charCount: number): Promise<void> {
  try {
    const date = todayStr();
    const costUSD = (charCount / 1_000_000) * PRICING.tts.perMillionChars;
    const costBRL = costUSD * USD_TO_BRL;

    const ref = doc(serverDb, 'ai_usage_daily', date);
    await setDoc(ref, {
      date,
      tts_requests:  increment(1),
      tts_chars:     increment(charCount),
      tts_costUSD:   increment(costUSD),
      totalCostUSD:  increment(costUSD),
      totalCostBRL:  increment(costBRL),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    logger.error(TAG, 'Failed to track TTS usage', err);
  }
}

/** Track ElevenLabs TTS usage by character count. */
export async function trackElevenLabsTTSUsage(charCount: number): Promise<void> {
  try {
    const date = todayStr();
    const costUSD = (charCount / 1_000_000) * PRICING.elevenlabs.perMillionChars;
    const costBRL = costUSD * USD_TO_BRL;

    const ref = doc(serverDb, 'ai_usage_daily', date);
    await setDoc(ref, {
      date,
      elevenlabs_requests: increment(1),
      elevenlabs_chars:    increment(charCount),
      elevenlabs_costUSD:  increment(costUSD),
      totalCostUSD:        increment(costUSD),
      totalCostBRL:        increment(costBRL),
      updatedAt:           serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    logger.error(TAG, 'Failed to track ElevenLabs TTS usage', err);
  }
}

/** Track OpenAI Whisper STT usage. Pass duration in seconds if known. */
export async function trackWhisperUsage(durationSeconds = 10): Promise<void> {
  try {
    const date = todayStr();
    const minutes = durationSeconds / 60;
    const costUSD = minutes * PRICING.whisper.perMinute;
    const costBRL = costUSD * USD_TO_BRL;

    const ref = doc(serverDb, 'ai_usage_daily', date);
    await setDoc(ref, {
      date,
      whisper_requests:        increment(1),
      whisper_durationSeconds: increment(durationSeconds),
      whisper_costUSD:         increment(costUSD),
      totalCostUSD:            increment(costUSD),
      totalCostBRL:            increment(costBRL),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    logger.error(TAG, 'Failed to track Whisper usage', err);
  }
}

/** Track Gemini image generation calls (free during preview, but counted for visibility). */
export async function trackGeminiImageUsage(imageCount = 1): Promise<void> {
  try {
    const date = todayStr();
    const costUSD = PRICING.geminiImage.perImage * imageCount;
    const costBRL = costUSD * USD_TO_BRL;

    const ref = doc(serverDb, 'ai_usage_daily', date);
    await setDoc(ref, {
      date,
      gemini_images:  increment(imageCount),
      gemini_imageCostUSD: increment(costUSD),
      totalCostUSD:   increment(costUSD),
      totalCostBRL:   increment(costBRL),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    logger.error(TAG, 'Failed to track Gemini image usage', err);
  }
}
