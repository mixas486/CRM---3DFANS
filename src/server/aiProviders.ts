import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import axios from "axios";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { serverStorage } from "./firebase";

process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] at:', promise, 'reason:', reason);
    if (reason instanceof Error) {
        console.error('[UNHANDLED REJECTION STACK]', reason.stack);
    }
});

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
    console.error('[UNCAUGHT EXCEPTION STACK]', error.stack);
});

let ai: GoogleGenAI | null = null;
let openai: OpenAI | null = null;

function getAiClient() {
    console.log('[DEBUG] getAiClient called');
    if (!ai) {
        const apiKey = process.env.GEMINI_API_KEY;
        console.log('[DEBUG] GEMINI_API_KEY present:', !!apiKey);
        if (!apiKey) throw new Error('GEMINI_API_KEY env var not set');
        ai = new GoogleGenAI({ 
            apiKey
        });
        console.log('[DEBUG] ai client instantiated');
    }
    return ai;
}

function getOpenAiClient() {
    console.log('[DEBUG] getOpenAiClient called');
    if (!openai && process.env.OPENROUTER_API_KEY) {
        console.log('[DEBUG] Instantiating OpenRouter client');
        openai = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: 'https://openrouter.ai/api/v1',
        });
    }
    return openai;
}

const timeoutPromise = (ms: number): Promise<never> => new Promise((_, reject) => {
    console.log('[TIMEOUT STARTED]', ms);
    setTimeout(() => {
        console.log('[TIMEOUT TRIGGERED]');
        reject(new Error('AI Provider Timeout'));
    }, ms);
});

async function generateGeminiResponse(prompt: string, systemInstruction?: string, temperature: number = 0.7, imageSource?: string | Buffer): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    console.log('[DEBUG] generateGeminiResponse start');
    try {
        const aiClient = getAiClient();
        const modelName = "gemini-2.5-flash";

        let contents: any[] = [];

        // Support Multimodal Real
        if (imageSource) {
            let imageBuffer: Buffer;
            if (Buffer.isBuffer(imageSource)) {
                imageBuffer = imageSource;
            } else {
                const res = await axios.get(imageSource, { responseType: 'arraybuffer' });
                imageBuffer = Buffer.from(res.data);
            }

            console.log('[PREVIEW] Gemini multimodal started');
            contents = [
                {
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: imageBuffer.toString('base64')
                    }
                },
                { text: prompt }
            ];
        } else {
            contents = [{ text: prompt }];
        }

        const result = await Promise.race([
            (aiClient.models.generateContent({
                model: modelName,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction || "Você é um assistente humano, simpático e eficiente.",
                    temperature: temperature,
                },
            }) as any),
            timeoutPromise(15000)
        ]);

        console.log('[GEMINI REQUEST FINISHED]');
        const responseText =
            result?.text ||
            result?.response?.text?.() ||
            result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            throw new Error('Gemini returned empty response');
        }

        const inputTokens: number = result?.usageMetadata?.promptTokenCount || 0;
        const outputTokens: number = result?.usageMetadata?.candidatesTokenCount || 0;

        console.log('[GEMINI SUCCESS]', responseText);
        return { text: responseText.trim(), inputTokens, outputTokens };
    } catch (error: any) {
        console.error('[GEMINI FAILED]', error);
        throw error;
    }
}

async function generateOpenAIResponse(prompt: string, systemInstruction?: string, temperature: number = 0.7): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    console.log('[DEBUG] generateOpenAIResponse start');
    const openAiClient = getOpenAiClient();
    if (!openAiClient) throw new Error('OpenAI API Key not configured');

    const completion = await openAiClient.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
            { role: 'system', content: systemInstruction || "Você é um assistente humano, simpático e eficiente." },
            { role: 'user', content: prompt },
        ],
        temperature: temperature,
    });
    console.log('[DEBUG] OpenAI completion success');
    const text = completion.choices[0]?.message?.content?.trim() || "";
    const inputTokens: number = completion.usage?.prompt_tokens || 0;
    const outputTokens: number = completion.usage?.completion_tokens || 0;
    return { text, inputTokens, outputTokens };
}

export async function generateAIResponse(
    prompt: string,
    systemInstruction?: string,
    temperature: number = 0.7,
    imageSource?: string | Buffer
): Promise<{ response: string; provider: string; usage: { inputTokens: number; outputTokens: number } }> {
    console.log('[AI PIPELINE START]', { temperature });
    try {
        // Attempt Gemini
        try {
            console.log('[GEMINI PIPELINE STEP]');
            const { text, inputTokens, outputTokens } = await generateGeminiResponse(prompt, systemInstruction, temperature, imageSource);
            console.log('[GEMINI FINAL OUTPUT]', text);
            return { response: text, provider: 'gemini', usage: { inputTokens, outputTokens } };
        } catch (geminiError: any) {
            console.error('[GEMINI PIPELINE ERROR]', geminiError?.message || geminiError);

            // Attempt OpenAI Fallback
            try {
                const openAiClient = getOpenAiClient();
                if (!openAiClient) throw new Error('No OpenAI configured');
                console.log('[OPENAI FALLBACK]');
                const { text, inputTokens, outputTokens } = await Promise.race([
                    generateOpenAIResponse(prompt, systemInstruction, temperature),
                    timeoutPromise(15000),
                ]);
                console.log('[OPENAI SUCCESS]', text);
                return { response: text, provider: 'openai', usage: { inputTokens, outputTokens } };
            } catch (openaiError: any) {
                console.error('[OPENAI FAILED fallback]', openaiError?.message || openaiError);
                return { response: 'Olá 😊 Como posso ajudar?', provider: 'fallback', usage: { inputTokens: 0, outputTokens: 0 } };
            }
        }
    } catch (error) {
        console.error('[AI PIPELINE ERROR]', error);
        return { response: 'Olá 😊 Como posso ajudar?', provider: 'fallback', usage: { inputTokens: 0, outputTokens: 0 } };
    } finally {
        console.log('[AI PIPELINE FINISHED]');
    }
}

/**
 * Analyzes an image using Gemini vision and returns a casual Portuguese description
 * that the SDR can use in conversation and in the generation prompt.
 */
export async function analyzeImageForSDR(imageBuffer: Buffer): Promise<{ sdrSummary: string; detailedDescription: string }> {
    console.log('[VISION ANALYSIS START]');
    try {
        const aiClient = getAiClient();

        const result = await Promise.race([
            (aiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: imageBuffer.toString('base64'),
                        },
                    },
                    {
                        text: `Analise esta imagem com dois objetivos:

1. RESUMO_SDR: Uma frase curta e casual em português descrevendo o que você vê, como se fosse para uma conversa de WhatsApp. Ex: "Vi uma menina bem fofa com cabelo cacheado e blusa azul" ou "Que cachorrinho adorável, parece um labrador dourado!"

2. DESCRICAO_DETALHADA: Uma descrição técnica em inglês com detalhes físicos completos para geração de imagem 3D (rosto, cabelo, roupa, pose, expressão). Seja bem específico.

Responda EXATAMENTE neste formato JSON:
{"sdrSummary": "...", "detailedDescription": "..."}`,
                    },
                ],
                config: { temperature: 0.3 },
            }) as any),
            timeoutPromise(20000),
        ]);

        const raw = result?.text || result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('[VISION ANALYSIS SUCCESS]', parsed.sdrSummary);
            return {
                sdrSummary: parsed.sdrSummary || '',
                detailedDescription: parsed.detailedDescription || 'The person in the reference photo',
            };
        }
        // Fallback: treat entire response as summary
        return { sdrSummary: raw.trim(), detailedDescription: 'The person in the reference photo' };
    } catch (error) {
        console.error('[VISION ANALYSIS FAILED]', error);
        return { sdrSummary: '', detailedDescription: 'The person in the reference photo' };
    }
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
    console.log('[STT PIPELINE START]');
    try {
        const openAiClient = getOpenAiClient();
        if (!openAiClient) throw new Error('OpenAI API Key not configured for STT');

        // OpenAI SDK expects a file-like object. We can simulate this.
        const file = {
            name: 'audio.ogg',
            type: 'audio/ogg',
            data: audioBuffer
        };

        const transcription = await openAiClient.audio.transcriptions.create({
            file: new File([file.data], file.name, {type: file.type}),
            model: 'whisper-1',
        });
        
        console.log('[STT SUCCESS] Audio transcribed');
        return transcription.text;
    } catch (error: any) {
        console.error('[STT GENERATION FAILED]', error);
        throw error;
    }
}

export async function generateAIAudio(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'): Promise<string> {
    console.log('[TTS PIPELINE START]', { voice, textLength: text.length });
    try {
        const openAiClient = getOpenAiClient();
        if (!openAiClient) throw new Error('OpenAI API Key not configured for TTS');

        const mp3 = await openAiClient.audio.speech.create({
            model: "tts-1",
            voice: voice,
            input: text,
        });
        
        const buffer = Buffer.from(await mp3.arrayBuffer());
        console.log('[TTS SUCCESS] Audio generated');
        return buffer.toString('base64');
    } catch (error: any) {
        console.error('[TTS GENERATION FAILED]', error);
        throw error;
    }
}

export async function generateElevenLabsAudio(text: string, voiceId: string): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
    if (!voiceId) throw new Error('ElevenLabs voice ID not configured');

    console.log('[TTS ELEVENLABS START]', { voiceId, textLength: text.length });

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`ElevenLabs TTS failed ${res.status}: ${errBody}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    console.log('[TTS ELEVENLABS SUCCESS] Audio generated');
    return buffer.toString('base64');
}

export async function generateMiniaturePreview(imageUrl: string, promptBase: string): Promise<string> {
    console.log('[MINIATURE PIPELINE START]', { imageUrl });
    try {
        const openAiClient = getOpenAiClient();
        if (!openAiClient) throw new Error('OpenAI API Key not configured for Image Generation');

        console.log('[IMAGE GENERATION START] Describing image via GPT-4o...');
        const descriptionRes = await openAiClient.chat.completions.create({
            model: "openai/gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Describe this person's physical appearance, facial features, hair style, clothing, and pose in extreme detail. Do not mention background." },
                        { type: "image_url", image_url: { url: imageUrl } }
                    ]
                }
            ],
            max_tokens: 300,
        });

        const imageDescription = descriptionRes.choices[0]?.message?.content || "A person";
        console.log('[AI IMAGE DESCRIPTION GENERATED]', imageDescription);

        const fullPrompt = `${imageDescription}. ${promptBase}`;

        console.log('[AI IMAGE GENERATION] Calling DALL-E 3...');
        const response = await openAiClient.images.generate({
            model: "dall-e-3",
            prompt: fullPrompt.substring(0, 4000),
            n: 1,
            size: "1024x1024",
            quality: "hd",
            style: "vivid"
        });

        const dallEUrl = response.data[0]?.url;
        if (!dallEUrl) {
            console.error('[AI IMAGE ERROR] OpenAI returned empty data array');
            throw new Error('OpenAI returned no image URL');
        }

        console.log('[IMAGE GENERATED SUCCESS] OpenAI URL:', dallEUrl);

        // Download and Upload to Firebase Storage for permanence
        console.log('[FIREBASE STORAGE UPLOAD] Downloading from OpenAI...');
        const imageRes = await axios.get(dallEUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(imageRes.data);

        const fileName = `previews/miniature_${Date.now()}.png`;
        const storageRef = ref(serverStorage, fileName);
        
        console.log('[FIREBASE STORAGE UPLOAD] Uploading to bucket...');
        await uploadBytes(storageRef, buffer, { contentType: 'image/png' });
        
        const publicUrl = await getDownloadURL(storageRef);
        console.log('[PUBLIC URL GENERATED]', publicUrl);

        return publicUrl;

    } catch (error: any) {
        console.error('[MINIATURE GENERATION FAILED]', error);
        throw error;
    }
}
