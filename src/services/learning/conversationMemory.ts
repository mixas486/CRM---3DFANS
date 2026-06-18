import { adminDb } from "../../server/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../logging/logger";
import { analyzeConversation, OutcomeType } from "./analyzeConversation";

const TAG = 'CONV_MEMORY';

// Firestore index required: sales_insights → stage ASC, successScore DESC
// Create via: firebase deploy --only firestore:indexes (add to firestore.indexes.json)

export async function saveConversationOutcome(
  chatId: string,
  contactId: string,
  outcome: OutcomeType,
  reachedStage: string,
  messages: Array<{ fromMe: boolean; text?: string }>
): Promise<void> {
  try {
    const analysis = await analyzeConversation(messages, outcome);
    if (!analysis) {
      logger.warn(TAG, `Skipped analysis for ${chatId}: insufficient data`);
      return;
    }

    const memoryId = `mem_${chatId}_${Date.now()}`;
    await adminDb.collection('conversation_memories').doc(memoryId).set({
      chatId,
      contactId,
      outcome,
      reachedStage,
      messageCount: messages.length,
      analysis,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Save high-quality key messages as reusable sales insights
    if (analysis.successScore >= 55 && analysis.keyMessages.length > 0) {
      const batch = adminDb.batch();
      for (const km of analysis.keyMessages.slice(0, 3)) {
        if (!km.message || km.message.length < 10) continue;
        const insightRef = adminDb.collection('sales_insights').doc();
        batch.set(insightRef, {
          stage: reachedStage,
          exampleMessage: km.message,
          reason: km.whyItWorked,
          successScore: analysis.successScore,
          outcome,
          tone: analysis.tone,
          timesViewed: 0,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      logger.info(TAG, `Saved ${Math.min(analysis.keyMessages.length, 3)} insights for stage=${reachedStage}`);
    }

    logger.info(TAG, `Memory saved: ${memoryId} | score=${analysis.successScore} | outcome=${outcome}`);
  } catch (err) {
    logger.error(TAG, 'Failed to save conversation outcome', err);
  }
}

export function triggerConversationAnalysis(
  chatId: string,
  contactId: string,
  nextStage: string,
  messages: Array<{ fromMe: boolean; text?: string }>
): void {
  const outcome: OutcomeType = nextStage === 'checkout' ? 'sale' : 'engaged';
  saveConversationOutcome(chatId, contactId, outcome, nextStage, messages)
    .catch(err => logger.error(TAG, 'Background analysis failed', err));
}

export async function getRelevantExamples(stage: string, maxResults = 3): Promise<string> {
  try {
    // Ensure we are using the adminDb from the correct file which is already configured for the named db
    const { adminDb } = await import('../../server/firebase-admin');
    
    const snap = await adminDb
      .collection('sales_insights')
      .where('stage', '==', stage)
      .orderBy('successScore', 'desc')
      .limit(maxResults)
      .get();

    if (snap.empty) {
        logger.info(TAG, `No sales insights found for stage ${stage}`);
        return '';
    }

    const lines = snap.docs.map((d, i) => {
      const data = d.data();
      return `${i + 1}. Exemplo (score ${data.successScore}): "${data.exampleMessage}"\n   → Por que funcionou: ${data.reason}`;
    }).join('\n');

    return `\n--- RESPOSTAS QUE JÁ FUNCIONARAM NESTA ETAPA ---\n${lines}\n-------------------------------------------------\n`;
  } catch (err) {
    logger.error(TAG, 'Failed to get relevant examples', err);
    return '';
  }
}
