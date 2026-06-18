/**
 * Webhook Observability System
 * Enterprise-grade logging and monitoring for Evolution API
 * Cloud Run optimized with structured logging
 */

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { serverDb } from '../../server/firebase';

// Event types for structured logging
export enum WebhookEventType {
  RECEIVED = 'WEBHOOK_RECEIVED',
  PROCESSED = 'WEBHOOK_PROCESSED',
  IGNORED = 'WEBHOOK_IGNORED',
  ERROR = 'WEBHOOK_ERROR',
  INVALID_JID = 'WEBHOOK_INVALID_JID',
  LID_BLOCKED = 'WEBHOOK_LID_BLOCKED',
  GROUP_BLOCKED = 'WEBHOOK_GROUP_BLOCKED',
  SPAM_DETECTED = 'WEBHOOK_SPAM_DETECTED',
  RATE_LIMITED = 'WEBHOOK_RATE_LIMITED',
  MEDIA_PROCESSED = 'WEBHOOK_MEDIA_PROCESSED',
  SDR_TRIGGERED = 'WEBHOOK_SDR_TRIGGERED'
}

// Severity levels for Cloud Logging
export enum LogSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  NOTICE = 'NOTICE',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
  ALERT = 'ALERT',
  EMERGENCY = 'EMERGENCY'
}

interface LogEntry {
  severity: LogSeverity;
  eventType: WebhookEventType;
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
  instanceId?: string;
  traceId?: string;
  spanId?: string;
  labels?: Record<string, string>;
}

interface EventLog {
  eventId: string;
  eventType: string;
  timestamp: any;
  instance?: string;
  remoteJid?: string;
  normalizedPhone?: string;
  fromMe?: boolean;
  hasMedia?: boolean;
  mediaType?: string;
  processingTime?: number;
  error?: string;
  metadata?: Record<string, any>;
}

// Trace context for distributed tracing
let currentTraceId: string | null = null;
let currentSpanId: string | null = null;

/**
 * Generate a new trace ID
 */
function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate a new span ID
 */
function generateSpanId(): string {
  return `span-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Set trace context for current request
 */
export function setTraceContext(traceId?: string, spanId?: string) {
  currentTraceId = traceId || generateTraceId();
  currentSpanId = spanId || generateSpanId();
}

/**
 * Clear trace context after request
 */
export function clearTraceContext() {
  currentTraceId = null;
  currentSpanId = null;
}

/**
 * Create structured log entry for Cloud Logging
 */
function createLogEntry(
  severity: LogSeverity,
  eventType: WebhookEventType,
  message: string,
  metadata?: Record<string, any>
): LogEntry {
  return {
    severity,
    eventType,
    message,
    timestamp: new Date().toISOString(),
    metadata,
    instanceId: process.env.GAE_INSTANCE || process.env.K_SERVICE || 'local',
    traceId: currentTraceId || undefined,
    spanId: currentSpanId || undefined,
    labels: {
      service: '3dfans-crm',
      component: 'webhook',
      environment: process.env.NODE_ENV || 'development'
    }
  };
}

/**
 * Log webhook event with structured format
 */
export function logEvent(
  eventType: WebhookEventType,
  message: string,
  metadata?: Record<string, any>,
  severity: LogSeverity = LogSeverity.INFO
) {
  const entry = createLogEntry(severity, eventType, message, metadata);
  
  // Structured logging for Cloud Logging
  console.log(JSON.stringify(entry));
  
  // Also log in human-readable format for local development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${eventType}] ${message}`, metadata || '');
  }
}

/**
 * Log error with stack trace
 */
export function logError(
  error: Error,
  context: Record<string, any> = {}
) {
  const entry = createLogEntry(
    LogSeverity.ERROR,
    WebhookEventType.ERROR,
    error.message,
    {
      ...context,
      stack: error.stack,
      name: error.name
    }
  );
  
  console.error(JSON.stringify(entry));
}

/**
 * Track event processing time
 */
export class EventTimer {
  private startTime: number;
  private eventType: WebhookEventType;
  private metadata: Record<string, any>;
  
  constructor(eventType: WebhookEventType, metadata: Record<string, any> = {}) {
    this.startTime = Date.now();
    this.eventType = eventType;
    this.metadata = metadata;
  }
  
  end(additionalMetadata?: Record<string, any>) {
    const duration = Date.now() - this.startTime;
    
    logEvent(
      this.eventType,
      `Event processed in ${duration}ms`,
      {
        ...this.metadata,
        ...additionalMetadata,
        processingTime: duration
      }
    );
    
    return duration;
  }
}

/**
 * Save event log to Firestore for analysis
 */
export async function saveEventLog(
  eventType: string,
  details: Partial<EventLog>
) {
  try {
    const eventId = `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const logRef = doc(serverDb, 'system_logs', 'webhook_events', 'logs', eventId);
    
    await setDoc(logRef, {
      eventId,
      eventType,
      timestamp: serverTimestamp(),
      ...details
    });
    
  } catch (error) {
    console.error('[OBSERVABILITY] Failed to save event log', error);
  }
}

/**
 * Monitor webhook health
 */
export async function checkWebhookHealth(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  
  try {
    // Check if webhook is processing events
    const metricsDoc = await doc(serverDb, 'system_metrics', 'webhook');
    // Implementation would check various health indicators
    
    return {
      healthy: issues.length === 0,
      issues
    };
  } catch (error) {
    return {
      healthy: false,
      issues: ['Failed to check webhook health']
    };
  }
}

/**
 * Create alert for critical issues
 */
export function createAlert(
  alertType: string,
  message: string,
  metadata?: Record<string, any>
) {
  logEvent(
    WebhookEventType.SPAM_DETECTED,
    message,
    {
      alertType,
      ...metadata
    },
    LogSeverity.ALERT
  );
  
  // In production, this could trigger additional alerting mechanisms
  // like PagerDuty, Slack, or Google Cloud Alerting
}

export default {
  WebhookEventType,
  LogSeverity,
  logEvent,
  logError,
  EventTimer,
  setTraceContext,
  clearTraceContext,
  saveEventLog,
  checkWebhookHealth,
  createAlert
};