// Log levels
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

// Logger interface
export interface ILogger {
  info(tag: string, message: any, metadata?: any): void;
  warn(tag: string, message: any, metadata?: any): void;
  error(tag: string, message: any, error?: any, metadata?: any): void;
  debug(tag: string, message: any, metadata?: any): void;
}

// Memory buffer for very early logs before DB is ready
const logBuffer: any[] = [];
let dbRef: any = null;
let addDocRef: any = null;
let serverTimestampRef: any = null;

// Initialize logging to Firestore (only called on backend/server)
export async function initRemoteLogging() {
  if (typeof window !== 'undefined') return; // Skip in browser

  try {
    const { serverDb } = await import('../../server/firebase');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    
    dbRef = serverDb;
    addDocRef = addDoc;
    serverTimestampRef = serverTimestamp;

    // Flush buffer
    while (logBuffer.length > 0) {
      const log = logBuffer.shift();
      await pushLog(log.level, log.tag, log.message, log.metadata);
    }
  } catch (err) {
    console.error('[LOGGER] Failed to initialize remote logging', err);
  }
}

async function pushLog(level: LogLevel, tag: string, message: any, metadata?: any) {
  const msgStr = typeof message === 'object' ? JSON.stringify(message) : String(message);
  
  // Console output always
  if (level === 'ERROR') console.error(`[${tag} ERROR] ${msgStr}`, metadata || '');
  else if (level === 'WARN') console.warn(`[${tag} WARN] ${msgStr}`);
  else console.log(`[${tag}] ${msgStr}`);

  if (!dbRef || !addDocRef || !serverTimestampRef) {
    if (logBuffer.length < 100) {
      logBuffer.push({ level, tag, message: msgStr, metadata, timestamp: Date.now() });
    }
    return;
  }

  try {
    await addDocRef(collection(dbRef, 'system_logs'), {
      level,
      tag,
      message: msgStr,
      metadata: metadata || null,
      timestamp: serverTimestampRef()
    });
  } catch (e) {
    // Silent fail to avoid infinite loops if DB fails
  }
}

export const logger: ILogger = {
  info: (tag, message, metadata) => {
    pushLog('INFO', tag, message, metadata);
  },
  warn: (tag, message, metadata) => {
    pushLog('WARN', tag, message, metadata);
  },
  error: (tag, message, error, metadata) => {
    const meta = { ...metadata };
    if (error) {
      meta.error = error.message || error;
      if (error.stack) meta.stack = error.stack;
    }
    pushLog('ERROR', tag, message, meta);
  },
  debug: (tag, message, metadata) => {
    pushLog('DEBUG', tag, message, metadata);
  }
};
