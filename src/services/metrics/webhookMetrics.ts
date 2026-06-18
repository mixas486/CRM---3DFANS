/**
 * Webhook Metrics System
 * Real-time metrics collection for Evolution API webhook events
 * Cloud Run ready with Firestore persistence
 */

import { doc, setDoc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { serverDb } from '../../server/firebase';

interface WebhookMetrics {
  upsertEvents: number;
  updateEvents: number;
  ignoredEvents: number;
  readReceipts: number;
  invalidEvents: number;
  lidEvents: number;
  groupEvents: number;
  totalEvents: number;
  lastEventAt: any;
  lastResetAt: any;
}

interface RateLimitMetrics {
  updateEventsPerMinute: number;
  upsertEventsPerMinute: number;
  totalEventsPerMinute: number;
  spamDetected: boolean;
  lastSpamAlert: any;
}

// In-memory counters for rate limiting (per instance)
const eventCounters = {
  updates: [] as number[],
  upserts: [] as number[],
  total: [] as number[]
};

// Clean old timestamps from counters (older than 1 minute)
function cleanCounters() {
  const oneMinuteAgo = Date.now() - 60000;
  
  Object.keys(eventCounters).forEach(key => {
    const counter = eventCounters[key as keyof typeof eventCounters];
    eventCounters[key as keyof typeof eventCounters] = counter.filter(
      timestamp => timestamp > oneMinuteAgo
    );
  });
}

/**
 * Track webhook event in metrics
 */
export async function trackWebhookEvent(
  eventType: 'upsert' | 'update' | 'ignored' | 'read' | 'invalid' | 'lid' | 'group'
) {
  try {
    const metricsRef = doc(serverDb, 'system_metrics', 'webhook');
    
    // Build increment object based on event type
    const increments: any = {
      totalEvents: increment(1),
      lastEventAt: serverTimestamp()
    };
    
    switch (eventType) {
      case 'upsert':
        increments.upsertEvents = increment(1);
        eventCounters.upserts.push(Date.now());
        eventCounters.total.push(Date.now());
        console.log('[METRICS] Upsert event tracked');
        break;
      
      case 'update':
        increments.updateEvents = increment(1);
        eventCounters.updates.push(Date.now());
        eventCounters.total.push(Date.now());
        console.log('[METRICS] Update event tracked');
        break;
      
      case 'ignored':
        increments.ignoredEvents = increment(1);
        console.log('[METRICS] Ignored event tracked');
        break;
      
      case 'read':
        increments.readReceipts = increment(1);
        console.log('[METRICS] Read receipt tracked');
        break;
      
      case 'invalid':
        increments.invalidEvents = increment(1);
        console.log('[METRICS] Invalid event tracked');
        break;
      
      case 'lid':
        increments.lidEvents = increment(1);
        increments.ignoredEvents = increment(1);
        console.log('[METRICS] LID event tracked');
        break;
      
      case 'group':
        increments.groupEvents = increment(1);
        increments.ignoredEvents = increment(1);
        console.log('[METRICS] Group event tracked');
        break;
    }
    
    // Update Firestore metrics
    await setDoc(metricsRef, increments, { merge: true });
    
    // Check for spam (rate limiting)
    cleanCounters();
    await checkSpamRate();
    
  } catch (error) {
    console.error('[METRICS ERROR]', error);
  }
}

/**
 * Check if spam rate limit is exceeded
 */
async function checkSpamRate() {
  const updateCount = eventCounters.updates.length;
  const totalCount = eventCounters.total.length;
  
  // Detect high update spam (>100 updates per minute)
  if (updateCount > 100) {
    console.warn('[WEBHOOK] High event spam detected', {
      updateEventsPerMinute: updateCount,
      totalEventsPerMinute: totalCount
    });
    
    // Update spam detection in Firestore
    const rateLimitRef = doc(serverDb, 'system_metrics', 'rate_limits');
    await setDoc(
      rateLimitRef,
      {
        updateEventsPerMinute: updateCount,
        totalEventsPerMinute: totalCount,
        spamDetected: true,
        lastSpamAlert: serverTimestamp()
      },
      { merge: true }
    );
    
    return true;
  }
  
  // Update normal rate metrics
  if (totalCount > 0) {
    const rateLimitRef = doc(serverDb, 'system_metrics', 'rate_limits');
    await setDoc(
      rateLimitRef,
      {
        updateEventsPerMinute: updateCount,
        upsertEventsPerMinute: eventCounters.upserts.length,
        totalEventsPerMinute: totalCount,
        spamDetected: false
      },
      { merge: true }
    );
  }
  
  return false;
}

/**
 * Get current webhook metrics
 */
export async function getWebhookMetrics(): Promise<WebhookMetrics | null> {
  try {
    const metricsRef = doc(serverDb, 'system_metrics', 'webhook');
    const snapshot = await getDoc(metricsRef);
    
    if (!snapshot.exists()) {
      // Initialize metrics if not exists
      const initialMetrics: WebhookMetrics = {
        upsertEvents: 0,
        updateEvents: 0,
        ignoredEvents: 0,
        readReceipts: 0,
        invalidEvents: 0,
        lidEvents: 0,
        groupEvents: 0,
        totalEvents: 0,
        lastEventAt: null,
        lastResetAt: serverTimestamp()
      };
      
      await setDoc(metricsRef, initialMetrics);
      return initialMetrics;
    }
    
    return snapshot.data() as WebhookMetrics;
  } catch (error) {
    console.error('[METRICS] Failed to get metrics', error);
    return null;
  }
}

/**
 * Reset webhook metrics (for maintenance)
 */
export async function resetWebhookMetrics() {
  try {
    const metricsRef = doc(serverDb, 'system_metrics', 'webhook');
    
    await setDoc(metricsRef, {
      upsertEvents: 0,
      updateEvents: 0,
      ignoredEvents: 0,
      readReceipts: 0,
      invalidEvents: 0,
      lidEvents: 0,
      groupEvents: 0,
      totalEvents: 0,
      lastEventAt: null,
      lastResetAt: serverTimestamp()
    });
    
    console.log('[METRICS] Webhook metrics reset');
  } catch (error) {
    console.error('[METRICS] Failed to reset metrics', error);
  }
}

/**
 * Log webhook event for observability
 */
export function logWebhookEvent(
  action: string,
  details?: Record<string, any>
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    action,
    ...details
  };
  
  // Structured logging for Cloud Logging
  console.log(`[WEBHOOK] ${action}`, JSON.stringify(logEntry));
}

export default {
  trackWebhookEvent,
  getWebhookMetrics,
  resetWebhookMetrics,
  logWebhookEvent
};