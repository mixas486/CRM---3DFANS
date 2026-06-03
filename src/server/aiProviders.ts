import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

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
    if (!openai && process.env.OPENAI_API_KEY) {
        console.log('[DEBUG] Instantiating OpenAI client');
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

async function generateGeminiResponse(prompt: string, systemInstruction?: string): Promise<string> {
    console.log('[DEBUG] generateGeminiResponse start');
    try {
        const aiClient = getAiClient();
        console.log('[DEBUG] aiClient acquired');
        
        const modelName = "gemini-2.5-flash";
        console.log('[GEMINI MODEL]', modelName);
        console.log('[GEMINI REQUEST STARTED]');
        const result = await Promise.race([
            (aiClient.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    systemInstruction: systemInstruction || "Você é um assistente humano, simpático e eficiente.",
                    temperature: 0.7,
                },
            }) as any),
            timeoutPromise(15000)
        ]);
        
        console.log('[GEMINI REQUEST FINISHED]');
        console.log('[GEMINI RAW RESULT]', JSON.stringify(result, null, 2));

        const responseText = 
            result?.text || 
            result?.response?.text?.() || 
            result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            throw new Error('Gemini returned empty response');
        }

        console.log('[GEMINI SUCCESS]', responseText);
        return responseText.trim();
    } catch (error: any) {
        console.error('[GEMINI FAILED]', error);
        console.error('[GEMINI FAILED STACK]', error?.stack);
        throw error;
    }
}

async function generateOpenAIResponse(prompt: string, systemInstruction?: string) {
    console.log('[DEBUG] generateOpenAIResponse start');
    const openAiClient = getOpenAiClient();
    if (!openAiClient) throw new Error('OpenAI API Key not configured');
    
    const completion = await openAiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemInstruction || "Você é um assistente humano, simpático e eficiente." },
            { role: 'user', content: prompt },
        ],
        temperature: 0.7,
    });
    console.log('[DEBUG] OpenAI completion success');
    return completion.choices[0]?.message?.content?.trim() || "";
}

export async function generateAIResponse(prompt: string, systemInstruction?: string): Promise<{ response: string; provider: string }> {
    console.log('[AI PIPELINE START]');
    try {
        // Attempt Gemini
        try {
            console.log('[GEMINI PIPELINE STEP]');
            const response = await generateGeminiResponse(prompt, systemInstruction);
            console.log('[GEMINI FINAL OUTPUT]', response);
            return { response, provider: 'gemini' };
        } catch (geminiError: any) {
            console.error('[GEMINI PIPELINE ERROR]', geminiError?.message || geminiError);

            // Attempt OpenAI Fallback
            try {
                const openAiClient = getOpenAiClient();
                if (!openAiClient) throw new Error('No OpenAI configured');
                console.log('[OPENAI FALLBACK]');
                console.log('[OPENAI ATTEMPT]');
                const response = await Promise.race([
                    generateOpenAIResponse(prompt, systemInstruction),
                    timeoutPromise(15000),
                ]);
                console.log('[OPENAI SUCCESS]', response);
                return { response, provider: 'openai' };
            } catch (openaiError: any) {
                console.error('[OPENAI FAILED fallback]', openaiError?.message || openaiError);
                
                console.log('[STATIC FALLBACK RESPONSE]');
                return { response: 'Olá 😊 Como posso ajudar?', provider: 'fallback' };
            }
        }
    } catch (error) {
        console.error('[AI PIPELINE ERROR]', error);
        return { response: 'Olá 😊 Como posso ajudar?', provider: 'fallback' };
    } finally {
        console.log('[AI PIPELINE FINISHED]');
    }
}
