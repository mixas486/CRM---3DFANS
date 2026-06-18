#!/usr/bin/env node
/**
 * Test Evolution API Webhook Scenarios
 * Simulates different webhook events to validate the stabilization layer
 */

import axios from 'axios';

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:5001/dfansapp/us-central1/evolutionWebhook';
const INSTANCE = '3dfans';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test scenarios
const scenarios = [
  {
    name: 'Valid WhatsApp Message',
    description: 'Standard incoming message from valid WhatsApp number',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: `msg_${Date.now()}_1`
        },
        message: {
          conversation: 'Olá, gostaria de informações sobre os produtos'
        },
        pushName: 'João Silva',
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'LID Message (Should be blocked)',
    description: 'Message from Linked Device ID - should be ignored',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: '35004084162802@lid',
          fromMe: false,
          id: `msg_${Date.now()}_2`
        },
        message: {
          conversation: 'Test message from LID'
        },
        pushName: 'LID User',
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Group Message (Should be blocked)',
    description: 'Message from group chat - should be ignored',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: '120363123456789012345@g.us',
          fromMe: false,
          id: `msg_${Date.now()}_3`,
          participant: '5511888888888@s.whatsapp.net'
        },
        message: {
          conversation: 'Message in group chat'
        },
        pushName: 'Group Member',
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Messages Update Event (Should be ignored)',
    description: 'Update event that should not trigger SDR',
    payload: {
      event: 'messages.update',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: `msg_${Date.now()}_4`
        },
        update: {
          status: 3
        }
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Image Message',
    description: 'Incoming image message with caption',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: '5521987654321@s.whatsapp.net',
          fromMe: false,
          id: `msg_${Date.now()}_5`
        },
        message: {
          imageMessage: {
            caption: 'Veja este produto',
            url: 'https://example.com/image.jpg',
            mimetype: 'image/jpeg'
          }
        },
        pushName: 'Maria Santos',
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Audio Message',
    description: 'Incoming audio message',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: '5511912345678@s.whatsapp.net',
          fromMe: false,
          id: `msg_${Date.now()}_6`
        },
        message: {
          audioMessage: {
            url: 'https://example.com/audio.ogg',
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
          }
        },
        pushName: 'Pedro Costa',
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Invalid JID Format',
    description: 'Message with invalid JID format',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: 'invalid-jid-format',
          fromMe: false,
          id: `msg_${Date.now()}_7`
        },
        message: {
          conversation: 'Test with invalid JID'
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Status Broadcast (Should be blocked)',
    description: 'Status update broadcast - should be ignored',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: 'status@broadcast',
          fromMe: false,
          id: `msg_${Date.now()}_8`
        },
        message: {
          conversation: 'Status update'
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Outbound Message (fromMe: true)',
    description: 'Message sent by the business',
    payload: {
      event: 'messages.upsert',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: true,
          id: `msg_${Date.now()}_9`
        },
        message: {
          conversation: 'Resposta automática do SDR'
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    },
    expectedStatus: 200
  },
  
  {
    name: 'Empty Event',
    description: 'Request without event field',
    payload: {
      instance: INSTANCE,
      data: {}
    },
    expectedStatus: 200
  }
];

// Spam test scenario (sends multiple messages rapidly)
async function testSpamScenario() {
  console.log(`\n${colors.yellow}═══ SPAM TEST SCENARIO ═══${colors.reset}`);
  console.log('Sending 50 update events in rapid succession...\n');
  
  const promises = [];
  for (let i = 0; i < 50; i++) {
    const payload = {
      event: 'messages.update',
      instance: INSTANCE,
      data: {
        key: {
          remoteJid: `5511999999${String(i).padStart(3, '0')}@s.whatsapp.net`,
          fromMe: false,
          id: `spam_msg_${Date.now()}_${i}`
        },
        update: { status: 3 }
      }
    };
    
    promises.push(
      axios.post(WEBHOOK_URL, payload)
        .catch(err => ({ status: err.response?.status || 'error' }))
    );
  }
  
  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.status === 200 || r.status === 429).length;
  const rateLimitCount = results.filter(r => r.status === 429).length;
  
  console.log(`Sent: 50 events`);
  console.log(`Success/Blocked: ${successCount}`);
  console.log(`Rate Limited (429): ${rateLimitCount}`);
  
  if (rateLimitCount > 0) {
    console.log(`${colors.green}✓ Rate limiting is working!${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠ Rate limiting may not be active${colors.reset}`);
  }
}

// Test individual scenario
async function testScenario(scenario: typeof scenarios[0]) {
  console.log(`\n${colors.cyan}Testing: ${scenario.name}${colors.reset}`);
  console.log(`${colors.dim}${scenario.description}${colors.reset}`);
  
  try {
    const startTime = Date.now();
    const response = await axios.post(WEBHOOK_URL, scenario.payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': `test-${Date.now()}`
      },
      timeout: 5000,
      validateStatus: () => true // Accept any status code
    });
    const duration = Date.now() - startTime;
    
    const success = response.status === scenario.expectedStatus;
    const icon = success ? '✓' : '✗';
    const color = success ? colors.green : colors.red;
    
    console.log(`${color}${icon} Status: ${response.status} (expected: ${scenario.expectedStatus})${colors.reset}`);
    console.log(`  Response time: ${duration}ms`);
    
    if (response.data) {
      console.log(`  Response: ${JSON.stringify(response.data)}`);
    }
    
    return success;
  } catch (error: any) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}║     Evolution API Webhook Test Suite - 3DFans CRM         ║${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
  
  console.log(`\n${colors.yellow}Webhook URL: ${WEBHOOK_URL}${colors.reset}`);
  console.log(`${colors.yellow}Instance: ${INSTANCE}${colors.reset}`);
  
  // Test connectivity
  console.log(`\n${colors.cyan}Testing webhook connectivity...${colors.reset}`);
  try {
    await axios.post(WEBHOOK_URL, { test: true }, { timeout: 3000, validateStatus: () => true });
    console.log(`${colors.green}✓ Webhook is reachable${colors.reset}`);
  } catch (error) {
    console.log(`${colors.red}✗ Cannot reach webhook. Is the server running?${colors.reset}`);
    console.log(`${colors.dim}Run: npm run dev${colors.reset}`);
    process.exit(1);
  }
  
  // Run individual scenarios
  console.log(`\n${colors.yellow}═══ INDIVIDUAL SCENARIOS ═══${colors.reset}`);
  let passed = 0;
  let failed = 0;
  
  for (const scenario of scenarios) {
    const result = await testScenario(scenario);
    if (result) passed++;
    else failed++;
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Run spam test
  await new Promise(resolve => setTimeout(resolve, 2000));
  await testSpamScenario();
  
  // Summary
  console.log(`\n${colors.yellow}═══ TEST SUMMARY ═══${colors.reset}`);
  console.log(`Total scenarios: ${scenarios.length}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  
  const successRate = (passed / scenarios.length * 100).toFixed(1);
  if (passed === scenarios.length) {
    console.log(`\n${colors.green}${colors.bright}✅ All tests passed! (${successRate}%)${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}⚠️ Some tests failed (${successRate}% passed)${colors.reset}`);
  }
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test suite failed:${colors.reset}`, error);
  process.exit(1);
});