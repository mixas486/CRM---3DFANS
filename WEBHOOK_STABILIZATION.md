# Evolution API Webhook Stabilization Layer

## 📋 Overview

Sistema enterprise-grade de estabilização para Evolution API implementado na 3DFans CRM, garantindo robustez, observabilidade e proteção contra spam.

## ✅ Features Implementadas

### 1. **Normalização de JID** (`/src/utils/normalizeWhatsAppId.ts`)
- ✅ Conversão de formatos WhatsApp para números limpos
- ✅ Bloqueio automático de LIDs (`@lid`)
- ✅ Bloqueio de grupos (`@g.us`)
- ✅ Bloqueio de broadcasts (`status@broadcast`)
- ✅ Validação de números brasileiros E164

### 2. **Sistema de Métricas** (`/src/services/metrics/webhookMetrics.ts`)
- ✅ Contadores de eventos em tempo real
- ✅ Tracking por tipo de evento (upsert, update, ignored, etc.)
- ✅ Persistência em Firestore
- ✅ Detecção automática de spam
- ✅ Métricas de rate limiting

### 3. **Observabilidade Avançada** (`/src/services/observability/webhookObservability.ts`)
- ✅ Structured logging para Cloud Logging
- ✅ Distributed tracing com trace/span IDs
- ✅ Event timing e performance metrics
- ✅ Severity levels (DEBUG até EMERGENCY)
- ✅ Alertas automáticos para eventos críticos

### 4. **Rate Limiting** (`/src/services/rateLimit/webhookRateLimit.ts`)
- ✅ Limites por minuto configuráveis
- ✅ Proteção contra spam de updates (>100/min)
- ✅ Limites por JID individual
- ✅ Sistema de bloqueio temporário
- ✅ Score de spam com threshold

### 5. **Webhook Aprimorado** (`/src/server/webhook.ts`)
- ✅ Integração completa com normalização
- ✅ Logging estruturado de todos eventos
- ✅ Early validation de JIDs
- ✅ Rate limiting por evento e por JID
- ✅ Trace context para debugging

## 📊 Métricas Coletadas

### Event Metrics
```typescript
{
  upsertEvents: number;      // Mensagens válidas processadas
  updateEvents: number;      // Eventos de atualização
  ignoredEvents: number;     // Eventos ignorados
  readReceipts: number;      // Confirmações de leitura
  invalidEvents: number;     // Eventos com formato inválido
  lidEvents: number;         // LIDs bloqueados
  groupEvents: number;       // Grupos bloqueados
  totalEvents: number;       // Total de eventos recebidos
}
```

### Rate Limit Metrics
```typescript
{
  updateEventsPerMinute: number;
  upsertEventsPerMinute: number;
  totalEventsPerMinute: number;
  spamDetected: boolean;
  lastSpamAlert: timestamp;
}
```

## 🛡️ Proteções Implementadas

### JID Filtering
- **LIDs**: `35004084162802@lid` → BLOCKED
- **Groups**: `xxxxx@g.us` → BLOCKED
- **Broadcasts**: `status@broadcast` → BLOCKED
- **Invalid**: Números < 10 dígitos → BLOCKED

### Rate Limiting
- **Updates**: Max 100/min (configurable)
- **Upserts**: Max 200/min (configurable)
- **Total**: Max 300/min (configurable)
- **Per JID**: Max 30/min (configurable)
- **Block Duration**: 5 minutes after spam detection

### Spam Protection
- Threshold: 5 violations before blocking
- Automatic unblock after timeout
- Persistent block state in Firestore
- Real-time spam score tracking

## 📝 Logs Estruturados

### Event Types
```typescript
enum WebhookEventType {
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
```

### Log Example
```json
{
  "severity": "INFO",
  "eventType": "WEBHOOK_PROCESSED",
  "message": "Message successfully processed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "metadata": {
    "msgId": "msg_123456",
    "chatId": "3dfans:5511999999999@s.whatsapp.net",
    "normalizedPhone": "5511999999999",
    "hasMedia": false
  },
  "traceId": "trace-1234567890",
  "spanId": "span-abc123"
}
```

## 🧪 Testing

### Unit Tests
```bash
# Test JID normalization
npm run test:webhook-normalization

# Expected output:
✅ All tests passed! JID normalization is working correctly.
```

### Integration Tests
```bash
# Test webhook scenarios
npm run test:webhook-scenarios

# Tests:
- Valid WhatsApp messages
- LID blocking
- Group blocking
- Update event filtering
- Media messages
- Rate limiting
- Spam detection
```

### Monitoring
```bash
# Real-time monitoring dashboard
npm run monitor:webhook

# Shows:
- Event metrics in real-time
- Rate limit status
- System health
- Spam detection alerts
```

## 📈 Firestore Collections

### System Metrics
```
system_metrics/
  ├── webhook/           # Event counters
  ├── rate_limits/       # Rate limit status
  └── rate_limit_blocks/ # Block history
```

### System Logs
```
system_logs/
  └── webhook_events/
      └── logs/          # Event logs for analysis
```

### System Config
```
system_config/
  └── rate_limits/       # Configurable limits
```

## 🚀 Cloud Run Deployment

### Environment Variables
```yaml
NODE_ENV: production
K_SERVICE: 3dfans-crm
GOOGLE_CLOUD_PROJECT: dfansapp
```

### Scaling Configuration
```yaml
minInstances: 1
maxInstances: 10
concurrency: 100
cpu: 1
memory: 512Mi
```

## 📊 Observability Dashboard

### Metrics to Monitor
1. **Event Rate**: Events per minute by type
2. **Error Rate**: Failed events percentage
3. **Response Time**: Webhook processing latency
4. **Spam Score**: Current spam detection level
5. **Block Status**: Active rate limit blocks

### Alerts to Configure
- High update event rate (>100/min)
- Spam detection triggered
- High error rate (>5%)
- Processing latency (>1000ms)

## 🔧 Configuration

### Rate Limits (Adjustable)
```typescript
const DEFAULT_CONFIG = {
  maxUpdatesPerMinute: 100,
  maxUpsertPerMinute: 200,
  maxTotalPerMinute: 300,
  maxPerJidPerMinute: 30,
  spamThreshold: 5,
  blockDuration: 5 * 60 * 1000 // 5 minutes
};
```

### Update via Firestore
```javascript
// In Firestore console or admin SDK
db.doc('system_config/rate_limits').set({
  maxUpdatesPerMinute: 150,
  maxUpsertPerMinute: 250
}, { merge: true });
```

## 🎯 Benefits

1. **Robustez Enterprise**: Sistema pronto para produção com proteções completas
2. **Zero Spam**: Bloqueio automático de eventos desnecessários
3. **Observabilidade Total**: Logs estruturados e métricas em tempo real
4. **Performance**: Rate limiting previne sobrecarga
5. **Debugging Fácil**: Trace IDs para rastrear eventos
6. **Configurável**: Limites ajustáveis sem deploy

## 📝 Usage

### Normal Operation
O sistema funciona automaticamente ao receber webhooks da Evolution API.

### Monitoring
```bash
# View real-time metrics
npm run monitor:webhook

# Check logs in Cloud Logging
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.eventType=~'WEBHOOK_'"
```

### Troubleshooting
1. Check rate limit status in Firestore
2. Review structured logs for errors
3. Monitor spam score and violations
4. Verify JID normalization for specific numbers

## ✅ Validation Checklist

- [x] LIDs são bloqueados corretamente
- [x] Grupos são ignorados
- [x] messages.update não dispara SDR
- [x] messages.upsert processa mídia
- [x] Rate limiting funciona
- [x] Métricas são coletadas
- [x] Logs estruturados funcionam
- [x] Spam é detectado e bloqueado
- [x] JIDs são normalizados
- [x] Sistema é Cloud Run ready

## 🔄 Future Improvements

1. **Metrics API**: Endpoint para consultar métricas via REST
2. **Webhook Replay**: Sistema para reprocessar eventos perdidos
3. **Advanced Analytics**: Dashboard com gráficos temporais
4. **Auto-scaling**: Ajuste dinâmico de rate limits baseado em carga
5. **ML Spam Detection**: Detecção inteligente de padrões de spam

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Last Updated**: Janeiro 2024