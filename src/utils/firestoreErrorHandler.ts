import { auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let globalHasQuotaError = false;
let globalQuotaErrorListeners: Array<(hasError: boolean) => void> = [];

export function getHasFirestoreQuotaError(): boolean {
  return globalHasQuotaError;
}

export function resetFirestoreQuotaError() {
  globalHasQuotaError = false;
  notifyQuotaListeners();
}

function notifyQuotaListeners() {
  globalQuotaErrorListeners.forEach(listener => {
    try {
      listener(globalHasQuotaError);
    } catch (e) {
      console.error('[Quota Listener Error]', e);
    }
  });
}

export function subscribeToQuotaError(callback: (hasError: boolean) => void) {
  globalQuotaErrorListeners.push(callback);
  callback(globalHasQuotaError);
  return () => {
    globalQuotaErrorListeners = globalQuotaErrorListeners.filter(c => c !== callback);
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errMsg = error instanceof Error ? error.message : String(error);
  
  if (
    errMsg.includes('Quota limit exceeded') || 
    errMsg.includes('Quota exceeded') || 
    errMsg.includes('quota is exceeded') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('code=resource-exhausted') ||
    errMsg.includes('free tier database') ||
    errMsg.includes('Free daily read units')
  ) {
    if (!globalHasQuotaError) {
      globalHasQuotaError = true;
      notifyQuotaListeners();
    }
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  const jsonErrorString = JSON.stringify(errInfo);
  console.error('Firestore Error Details: ', jsonErrorString);
  throw new Error(jsonErrorString);
}
