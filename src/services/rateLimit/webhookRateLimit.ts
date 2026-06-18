/**
 * Webhook Rate Limiting System
 * Protection against spam and abuse from Evolution API
 * In-memory rate limiting with Firestore persistence
 */

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { serverDb } from '../../server/firebase';
import { createAlert } from '../observability/webhookObservability';

interface RateLimitConfig {
  maxUpdatesPerMinute: number;
  maxUpsertPerMinute: number;
  maxTotalPerMinute: number;
  maxPerJidPerMinute: number;
  spamThreshold: number;
  blockDuration: number; // in milliseconds
}

interface RateLimitState {
  updateCount: number;
  upsertCount: number;
  totalCount: number;
  jidCounts: Map<string, number>;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
  spamScore: number;
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  maxUpdatesPerMinute: 100,
  maxUpsertPerMinute: 200,
  maxTotalPerMinute: 300,
  maxPerJidPerMinute: 30,
  spamThreshold: 5, // Number of violations before blocking
  blockDuration: 5 * 60 * 1000 // 5 minutes
};

// In-memory state for current instance
const rateLimitState: RateLimitState = {
  updateCount: 0,
  upsertCount: 0,
  totalCount: 0,
  jidCounts: new Map(),
  windowStart: Date.now(),
  blocked: false,
  spamScore: 0
};

// Track recent violations
const recentViolations: number[] = [];

/**
 * Reset rate limit window
 */
function resetWindow() {
  rateLimitState.updateCount = 0;
  rateLimitState.upsertCount = 0;
  rateLimitState.totalCount = 0;
  rateLimitState.jidCounts.clear();
  rateLimitState.windowStart = Date.now();
}

/**
 * Check if current window has expired
 */
function isWindowExpired(): boolean {
  return Date.now() - rateLimitState.windowStart > 60000; // 1 minute window
}

/**
 * Clean old violations (older than 5 minutes)
 */
function cleanViolations() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  while (recentViolations.length > 0 && recentViolations[0] < fiveMinutesAgo) {
    recentViolations.shift();
  }
}

/**
 * Check if webhook is currently blocked
 */
export function isBlocked(): boolean {
  if (!rateLimitState.blocked) {
    return false;
  }
  
  if (rateLimitState.blockedUntil && Date.now() > rateLimitState.blockedUntil) {
    // Unblock if block duration has passed
    rateLimitState.blocked = false;
    rateLimitState.blockedUntil = undefined;
    rateLimitState.spamScore = 0;
    console.log('[RATE_LIMIT] Webhook unblocked');
    return false;
  }
  
  return true;
}

/**
 * Block webhook for specified duration
 */
function blockWebhook(reason: string, duration: number = DEFAULT_CONFIG.blockDuration) {
  rateLimitState.blocked = true;
  rateLimitState.blockedUntil = Date.now() + duration;
  
  createAlert('WEBHOOK_BLOCKED', reason, {
    blockedUntil: new Date(rateLimitState.blockedUntil).toISOString(),
    durationMs: duration,
    spamScore: rateLimitState.spamScore
  });
  
  // Persist block state to Firestore
  persistBlockState(reason);
}

/**
 * Persist block state to Firestore
 */
async function persistBlockState(reason: string) {
  try {
    const blockRef = doc(serverDb, 'system_metrics', 'rate_limit_blocks');
    await setDoc(
      blockRef,
      {
        blocked: true,
        blockedAt: serverTimestamp(),
        blockedUntil: new Date(rateLimitState.blockedUntil!).toISOString(),
        reason,
        spamScore: rateLimitState.spamScore,
        recentViolations: recentViolations.length
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[RATE_LIMIT] Failed to persist block state', error);
  }
}

/**
 * Track an event and check rate limits
 */
export function trackEvent(
  eventType: 'update' | 'upsert' | 'other',
  remoteJid?: string
): { allowed: boolean; reason?: string } {
  // Check if blocked
  if (isBlocked()) {
    return { 
      allowed: false, 
      reason: `Webhook blocked until ${new Date(rateLimitState.blockedUntil!).toISOString()}` 
    };
  }
  
  // Reset window if expired
  if (isWindowExpired()) {
    resetWindow();
  }
  
  // Increment counters
  rateLimitState.totalCount++;
  
  if (eventType === 'update') {
    rateLimitState.updateCount++;
  } else if (eventType === 'upsert') {
    rateLimitState.upsertCount++;
  }
  
  // Track per-JID counts
  if (remoteJid) {
    const currentCount = rateLimitState.jidCounts.get(remoteJid) || 0;
    rateLimitState.jidCounts.set(remoteJid, currentCount + 1);
    
    // Check per-JID limit
    if (currentCount + 1 > DEFAULT_CONFIG.maxPerJidPerMinute) {
      recordViolation('per_jid_limit', remoteJid);
      return { 
        allowed: false, 
        reason: `JID ${remoteJid} exceeded rate limit` 
      };
    }
  }
  
  // Check update limit
  if (rateLimitState.updateCount > DEFAULT_CONFIG.maxUpdatesPerMinute) {
    recordViolation('update_limit');
    console.warn('[WEBHOOK] High event spam detected - Updates', {
      updateEventsPerMinute: rateLimitState.updateCount,
      window: new Date(rateLimitState.windowStart).toISOString()
    });
    
    // Block if too many violations
    if (recentViolations.length >= DEFAULT_CONFIG.spamThreshold) {
      blockWebhook('Excessive update events');
      return { 
        allowed: false, 
        reason: 'Webhook blocked due to excessive update events' 
      };
    }
    
    return { 
      allowed: false, 
      reason: 'Update rate limit exceeded' 
    };
  }
  
  // Check upsert limit
  if (rateLimitState.upsertCount > DEFAULT_CONFIG.maxUpsertPerMinute) {
    recordViolation('upsert_limit');
    return { 
      allowed: false, 
      reason: 'Upsert rate limit exceeded' 
    };
  }
  
  // Check total limit
  if (rateLimitState.totalCount > DEFAULT_CONFIG.maxTotalPerMinute) {
    recordViolation('total_limit');
    
    if (recentViolations.length >= DEFAULT_CONFIG.spamThreshold) {
      blockWebhook('Excessive total events');
      return { 
        allowed: false, 
        reason: 'Webhook blocked due to excessive total events' 
      };
    }
    
    return { 
      allowed: false, 
      reason: 'Total rate limit exceeded' 
    };
  }
  
  return { allowed: true };
}

/**
 * Record a rate limit violation
 */
function recordViolation(type: string, details?: string) {
  const now = Date.now();
  recentViolations.push(now);
  rateLimitState.spamScore++;
  
  cleanViolations();
  
  console.warn('[RATE_LIMIT] Violation recorded', {
    type,
    details,
    totalViolations: recentViolations.length,
    spamScore: rateLimitState.spamScore
  });
}

/**
 * Get current rate limit status
 */
export function getStatus(): {
  blocked: boolean;
  counts: {
    updates: number;
    upserts: number;
    total: number;
  };
  windowStart: string;
  spamScore: number;
  violations: number;
} {
  cleanViolations();
  
  return {
    blocked: isBlocked(),
    counts: {
      updates: rateLimitState.updateCount,
      upserts: rateLimitState.upsertCount,
      total: rateLimitState.totalCount
    },
    windowStart: new Date(rateLimitState.windowStart).toISOString(),
    spamScore: rateLimitState.spamScore,
    violations: recentViolations.length
  };
}

/**
 * Load rate limit configuration from Firestore
 */
export async function loadConfig(): Promise<RateLimitConfig> {
  try {
    const configRef = doc(serverDb, 'system_config', 'rate_limits');
    const snapshot = await getDoc(configRef);
    
    if (snapshot.exists()) {
      return { ...DEFAULT_CONFIG, ...snapshot.data() } as RateLimitConfig;
    }
  } catch (error) {
    console.error('[RATE_LIMIT] Failed to load config', error);
  }
  
  return DEFAULT_CONFIG;
}

/**
 * Update rate limit configuration
 */
export async function updateConfig(config: Partial<RateLimitConfig>) {
  try {
    const configRef = doc(serverDb, 'system_config', 'rate_limits');
    await setDoc(configRef, config, { merge: true });
    
    // Update in-memory config
    Object.assign(DEFAULT_CONFIG, config);
    
    console.log('[RATE_LIMIT] Configuration updated', config);
  } catch (error) {
    console.error('[RATE_LIMIT] Failed to update config', error);
  }
}

export default {
  trackEvent,
  isBlocked,
  getStatus,
  loadConfig,
  updateConfig
};