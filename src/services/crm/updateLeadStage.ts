import { adminDb } from '../../server/firebase-admin';
import { logger } from '../logging/logger';

const TAG = 'CRM';

export type LeadStage =
  | 'greeting'
  | 'collecting_reference'
  | 'preview_requested'
  | 'generating_preview'
  | 'preview_sent'
  | 'negotiating'
  | 'checkout'
  | 'closed';

export async function updateLeadStage(chatId: string, stage: LeadStage): Promise<void> {
  logger.info(TAG, `Updating lead stage to ${stage} for ${chatId}`);
  
  try {
    await adminDb.collection('chats').doc(chatId).set({
      leadStage: stage,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    logger.error(TAG, `Failed to update lead stage for ${chatId}`, err);
  }
}
