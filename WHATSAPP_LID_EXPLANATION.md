# WhatsApp @lid Identifiers - Technical Explanation

## How Evolution API Handles @lid

When a message comes from a WhatsApp Business Account (often via click-to-chat ads), the `remoteJid` field from Evolution API contains an internal identifier format:

```
270033905316003@lid
```

**CRITICAL:** This is NOT a real phone number. `@lid` means "Line ID". However, **Evolution API (Baileys) natively supports sending messages back to `@lid` exactly as they are received.**

## The Previous Mistake

1. **Inbound Message Received**
   - `remoteJid: 270033905316003@lid`

2. **Previous Flawed Processing**
   - System extracted: `270033905316003` from `@lid`
   - Treated it as a regular phone: `+270033905316003` (or appended `@s.whatsapp.net`)
   - Attempted to send outbound message
   - Evolution API responded: `exists:false` (because 270033905316003 is not a real WhatsApp phone number)

## The Correct Solution Implemented

### 1. evolution.ts (Sending logic)
```typescript
let finalNumber = number;

// If it's a @lid, send exactly as is (Evolution/Baileys supports it natively)
if (!number.includes('@lid')) {
  // Regular phone number: clean up and validate
  // ...
}
```

### 2. sdrEngine.ts (SDR Engine logic)
```typescript
let targetIdentifier = '';

if (remoteJid && remoteJid.includes('@lid')) {
    // Keep exact @lid format
    targetIdentifier = remoteJid; 
} else {
    // Standard phone processing
    targetIdentifier = phoneE164.replace(/[^\d]/g, '');
}

await sendEvolutionMessage(targetIdentifier, responseText);
```

## Summary

- **Regular User** → `5511987654321@s.whatsapp.net` → Cleaned to `5511987654321` for Evolution API.
- **Business Account (LID)** → `270033905316003@lid` → Sent **exactly as is** to Evolution API.

Do NOT attempt to convert `@lid` to a phone number by stripping the `@lid` suffix, as it will break the outbound routing in Baileys.
