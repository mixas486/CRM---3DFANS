#!/usr/bin/env node
/**
 * Webhook Monitoring Dashboard
 * Real-time monitoring of Evolution API webhook metrics
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, 'serviceAccount.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ serviceAccount.json not found');
  console.error('Please add your Firebase service account key to:', serviceAccountPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

async function getWebhookMetrics() {
  try {
    const metricsDoc = await db.doc('system_metrics/webhook').get();
    return metricsDoc.exists() ? metricsDoc.data() : null;
  } catch (error) {
    console.error('Failed to fetch webhook metrics:', error);
    return null;
  }
}

async function getRateLimitStatus() {
  try {
    const rateLimitDoc = await db.doc('system_metrics/rate_limits').get();
    return rateLimitDoc.exists() ? rateLimitDoc.data() : null;
  } catch (error) {
    console.error('Failed to fetch rate limit status:', error);
    return null;
  }
}

async function getSystemConfig() {
  try {
    const configDoc = await db.doc('system/system').get();
    return configDoc.exists() ? configDoc.data() : null;
  } catch (error) {
    console.error('Failed to fetch system config:', error);
    return null;
  }
}

function clearScreen() {
  console.clear();
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('pt-BR').format(num);
}

function formatTimestamp(timestamp: any): string {
  if (!timestamp) return 'Never';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('pt-BR');
}

function printHeader() {
  console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║           3DFANS CRM - Webhook Monitoring Dashboard           ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`);
}

function printSection(title: string) {
  console.log(`${colors.bright}${colors.white}┌─ ${title} ${'─'.repeat(60 - title.length)}┐${colors.reset}`);
}

function printMetric(label: string, value: any, color: string = colors.white, suffix: string = '') {
  const paddedLabel = label.padEnd(30, '.');
  console.log(`${colors.dim}│${colors.reset} ${paddedLabel} ${color}${colors.bright}${value}${colors.reset}${suffix}`);
}

function printEndSection() {
  console.log(`${colors.dim}└${'─'.repeat(64)}┘${colors.reset}`);
}

function getHealthColor(value: number, thresholds: { good: number; warning: number }): string {
  if (value <= thresholds.good) return colors.green;
  if (value <= thresholds.warning) return colors.yellow;
  return colors.red;
}

async function displayDashboard() {
  clearScreen();
  printHeader();
  
  const [metrics, rateLimit, config] = await Promise.all([
    getWebhookMetrics(),
    getRateLimitStatus(),
    getSystemConfig()
  ]);
  
  const timestamp = new Date().toLocaleString('pt-BR');
  console.log(`${colors.dim}Last updated: ${timestamp}${colors.reset}\n`);
  
  // Webhook Metrics Section
  printSection('📊 Webhook Event Metrics');
  if (metrics) {
    const total = metrics.totalEvents || 0;
    const upserts = metrics.upsertEvents || 0;
    const updates = metrics.updateEvents || 0;
    const ignored = metrics.ignoredEvents || 0;
    const invalid = metrics.invalidEvents || 0;
    const lids = metrics.lidEvents || 0;
    const groups = metrics.groupEvents || 0;
    
    printMetric('Total Events', formatNumber(total), colors.cyan);
    printMetric('Messages Upsert', formatNumber(upserts), colors.green);
    printMetric('Messages Update', formatNumber(updates), colors.yellow);
    printMetric('Ignored Events', formatNumber(ignored), colors.yellow);
    printMetric('Invalid Events', formatNumber(invalid), colors.red);
    printMetric('LID Events (blocked)', formatNumber(lids), colors.magenta);
    printMetric('Group Events (blocked)', formatNumber(groups), colors.magenta);
    printMetric('Last Event', formatTimestamp(metrics.lastEventAt), colors.dim);
    
    if (upserts > 0) {
      const successRate = ((upserts / total) * 100).toFixed(1);
      printMetric('Upsert Rate', `${successRate}%`, 
        parseFloat(successRate) > 50 ? colors.green : colors.yellow);
    }
  } else {
    console.log(`${colors.red}No metrics data available${colors.reset}`);
  }
  printEndSection();
  
  // Rate Limiting Section
  console.log('');
  printSection('🚦 Rate Limiting Status');
  if (rateLimit) {
    const updateRate = rateLimit.updateEventsPerMinute || 0;
    const upsertRate = rateLimit.upsertEventsPerMinute || 0;
    const totalRate = rateLimit.totalEventsPerMinute || 0;
    const spamDetected = rateLimit.spamDetected || false;
    
    printMetric('Updates/min', updateRate, 
      getHealthColor(updateRate, { good: 50, warning: 80 }), ' events/min');
    printMetric('Upserts/min', upsertRate,
      getHealthColor(upsertRate, { good: 100, warning: 150 }), ' events/min');
    printMetric('Total/min', totalRate,
      getHealthColor(totalRate, { good: 200, warning: 250 }), ' events/min');
    
    if (spamDetected) {
      printMetric('⚠️ SPAM DETECTED', 'YES', colors.red);
      if (rateLimit.lastSpamAlert) {
        printMetric('Last Alert', formatTimestamp(rateLimit.lastSpamAlert), colors.red);
      }
    } else {
      printMetric('Spam Status', 'Clear', colors.green);
    }
  } else {
    console.log(`${colors.dim}No rate limit data available${colors.reset}`);
  }
  printEndSection();
  
  // System Configuration Section
  console.log('');
  printSection('⚙️ System Configuration');
  if (config) {
    const sdrEnabled = config.globalSDREnabled !== false;
    printMetric('Global SDR', sdrEnabled ? 'ENABLED' : 'DISABLED',
      sdrEnabled ? colors.green : colors.yellow);
    printMetric('Instance', config.instanceName || '3dfans', colors.blue);
    
    if (config.aiProvider) {
      printMetric('AI Provider', config.aiProvider, colors.magenta);
    }
  } else {
    console.log(`${colors.dim}No configuration data available${colors.reset}`);
  }
  printEndSection();
  
  // Health Summary
  console.log('');
  printSection('🏥 Health Summary');
  
  const healthChecks = [];
  
  // Check update spam
  if (rateLimit?.updateEventsPerMinute > 100) {
    healthChecks.push({
      status: '⚠️',
      message: 'High update event rate detected',
      color: colors.yellow
    });
  }
  
  // Check spam detection
  if (rateLimit?.spamDetected) {
    healthChecks.push({
      status: '❌',
      message: 'Spam detection triggered',
      color: colors.red
    });
  }
  
  // Check LID events
  if (metrics?.lidEvents > 100) {
    healthChecks.push({
      status: '⚠️',
      message: `High LID event count: ${metrics.lidEvents}`,
      color: colors.yellow
    });
  }
  
  // Check invalid events ratio
  if (metrics?.totalEvents > 0 && metrics?.invalidEvents > 0) {
    const invalidRatio = (metrics.invalidEvents / metrics.totalEvents) * 100;
    if (invalidRatio > 10) {
      healthChecks.push({
        status: '⚠️',
        message: `High invalid event ratio: ${invalidRatio.toFixed(1)}%`,
        color: colors.yellow
      });
    }
  }
  
  if (healthChecks.length === 0) {
    console.log(`${colors.green}${colors.bright}✅ All systems operational${colors.reset}`);
  } else {
    healthChecks.forEach(check => {
      console.log(`${check.color}${check.status} ${check.message}${colors.reset}`);
    });
  }
  
  printEndSection();
  
  console.log(`\n${colors.dim}Press Ctrl+C to exit. Refreshing in 5 seconds...${colors.reset}`);
}

// Main monitoring loop
async function startMonitoring() {
  console.log(`${colors.cyan}Starting webhook monitoring...${colors.reset}\n`);
  
  // Initial display
  await displayDashboard();
  
  // Refresh every 5 seconds
  setInterval(async () => {
    await displayDashboard();
  }, 5000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Stopping monitoring...${colors.reset}`);
  process.exit(0);
});

// Start the monitoring
startMonitoring().catch(error => {
  console.error(`${colors.red}Failed to start monitoring:${colors.reset}`, error);
  process.exit(1);
});