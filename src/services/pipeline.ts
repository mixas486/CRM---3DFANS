import { updateContact } from './firestore';
import { ContactStage } from '../types';

export const updateContactStage = async (contactId: string, currentStage: ContactStage, newStage: ContactStage) => {
  if (currentStage === newStage) return;

  const updates: any = {
    stage: newStage,
    stageChangedAt: Date.now(),
  };

  // Rule 1: Marcar para follow-up
  if (newStage === 'Orçamento Enviado') {
    // Phase 4 foreshadowing - add some marker, or just the fact that it's in this stage + timestamp gives us the ability to query it.
    // We could add a explicit flag if requested later.
  }

  await updateContact(contactId, updates);
};
