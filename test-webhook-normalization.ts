#!/usr/bin/env node
/**
 * Test Webhook JID Normalization and Observability
 * Validates the enterprise-grade Evolution API stabilization
 */

import { normalizeWhatsAppId, shouldIgnoreJid, extractPhoneFromJid, isValidBrazilianWhatsApp } from './src/utils/normalizeWhatsAppId';

console.log('=== TESTING WEBHOOK JID NORMALIZATION ===\n');

// Test cases for JID normalization
const testCases = [
  // Valid WhatsApp numbers
  { jid: '5511999999999@s.whatsapp.net', expected: '5511999999999', shouldIgnore: false },
  { jid: '5521987654321@s.whatsapp.net', expected: '5521987654321', shouldIgnore: false },
  { jid: '5511912345678@s.whatsapp.net', expected: '5511912345678', shouldIgnore: false },
  
  // LID (Linked Device) - Should be ignored
  { jid: '35004084162802@lid', expected: null, shouldIgnore: true },
  { jid: '12345678901234@lid', expected: null, shouldIgnore: true },
  
  // Group chats - Should be ignored
  { jid: '120363123456789012345@g.us', expected: null, shouldIgnore: true },
  { jid: 'groupid@g.us', expected: null, shouldIgnore: true },
  
  // Status broadcast - Should be ignored
  { jid: 'status@broadcast', expected: null, shouldIgnore: true },
  
  // Plain phone numbers (valid)
  { jid: '5511999999999', expected: '5511999999999', shouldIgnore: false },
  { jid: '+5511999999999', expected: '5511999999999', shouldIgnore: false },
  
  // Invalid formats
  { jid: '', expected: null, shouldIgnore: true },
  { jid: 'invalid', expected: null, shouldIgnore: false },
  { jid: '123', expected: null, shouldIgnore: false }
];

console.log('Testing JID Normalization:\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\nTesting: ${testCase.jid}`);
  
  // Test shouldIgnoreJid
  const shouldIgnore = shouldIgnoreJid(testCase.jid);
  const ignoreCorrect = shouldIgnore === testCase.shouldIgnore;
  console.log(`  shouldIgnore: ${shouldIgnore} ${ignoreCorrect ? '✓' : '✗'} (expected: ${testCase.shouldIgnore})`);
  
  // Test normalizeWhatsAppId
  const result = normalizeWhatsAppId(testCase.jid);
  console.log(`  Normalization result:`);
  console.log(`    - isValid: ${result.isValid}`);
  console.log(`    - normalizedId: ${result.normalizedId || 'none'}`);
  console.log(`    - type: ${result.type}`);
  console.log(`    - reason: ${result.reason || 'none'}`);
  
  // Test extractPhoneFromJid
  const extracted = extractPhoneFromJid(testCase.jid);
  const extractCorrect = extracted === testCase.expected;
  console.log(`  Extracted phone: ${extracted || 'null'} ${extractCorrect ? '✓' : '✗'} (expected: ${testCase.expected})`);
  
  if (ignoreCorrect && extractCorrect) {
    passed++;
    console.log(`  Result: PASS ✓`);
  } else {
    failed++;
    console.log(`  Result: FAIL ✗`);
  }
}

console.log('\n=== TESTING BRAZILIAN PHONE VALIDATION ===\n');

const brazilianTestCases = [
  { phone: '5511999999999', expected: true }, // São Paulo mobile
  { phone: '5521987654321', expected: true }, // Rio mobile
  { phone: '5511912345678', expected: true }, // São Paulo mobile (9-digit)
  { phone: '5511812345678', expected: false }, // Invalid (8-digit starting with 8)
  { phone: '5500999999999', expected: false }, // Invalid area code (00)
  { phone: '5511999999', expected: false }, // Too short
  { phone: '551199999999999', expected: false }, // Too long
  { phone: '1234567890123', expected: false }, // Not Brazilian (doesn't start with 55)
  { phone: '5561999999999', expected: true }, // Brasília mobile
];

console.log('Testing Brazilian Phone Validation:\n');

for (const testCase of brazilianTestCases) {
  const isValid = isValidBrazilianWhatsApp(testCase.phone);
  const correct = isValid === testCase.expected;
  
  console.log(`${testCase.phone}: ${isValid ? 'Valid' : 'Invalid'} ${correct ? '✓' : '✗'} (expected: ${testCase.expected ? 'Valid' : 'Invalid'})`);
  
  if (correct) {
    passed++;
  } else {
    failed++;
  }
}

console.log('\n=== TEST SUMMARY ===');
console.log(`Total tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n❌ Some tests failed. Please review the implementation.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed! JID normalization is working correctly.');
  process.exit(0);
}