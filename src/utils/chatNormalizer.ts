export function normalizeChat(raw: any) {
  const possibleChatId = raw.chatId || raw.id || '';
  
  // Extract number if composite chatId is format "instance:phone"
  let possiblePhone = raw.phoneE164 || raw.phone || raw.telefoneE164 || '';
  if (!possiblePhone && possibleChatId.includes(':')) {
    possiblePhone = possibleChatId.split(':')[1] || '';
  }

  const getMillis = (val: any) => {
    if (!val) return null;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) return parsed;
    }
    if (val instanceof Date) return val.getTime();
    return null;
  };

  const lastMessageAt = 
    getMillis(raw.lastMessageAt) ||
    getMillis(raw.updatedAt) ||
    getMillis(raw.createdAt) ||
    getMillis(raw.timestamp) ||
    Date.now();

  const cleanPhone = possiblePhone.replace(/[^\d]/g, '');
  const phoneE164Formatted = cleanPhone ? '+' + cleanPhone : '';

  const finalName = raw.pushName || raw.name || raw.contactName || 'Sem nome';
  const finalAvatar = raw.avatar || raw.profilePicUrl || raw.avatarUrl || null;

  return {
    id: possibleChatId,
    chatId: possibleChatId,

    phone: cleanPhone,
    telefoneE164: phoneE164Formatted,
    phoneE164: phoneE164Formatted,

    name: finalName,
    pushName: finalName,

    lastMessage: raw.lastMessage || raw.text || '',

    unreadCount: raw.unreadCount || 0,

    lastMessageAt,
    lastMessageTime: lastMessageAt,

    avatar: finalAvatar,
    profilePicUrl: finalAvatar,

    hasOutbound: raw.hasOutbound || false,
    outboundCount: raw.outboundCount || 0,
    inboundCount: raw.inboundCount || 0,
    lastOutboundAt: raw.lastOutboundAt,
    lastInboundAt: raw.lastInboundAt,
    lastMessageDirection: raw.lastMessageDirection,
    repliedAfterOutbound: raw.repliedAfterOutbound || false,
    firstOutboundAt: raw.firstOutboundAt,
    firstInboundAt: raw.firstInboundAt,
    sdrEnabled: raw.sdrEnabled || false,
    sdrStage: raw.sdrStage || 'novo_lead',
    sdrProcessing: raw.sdrProcessing || false,
    lastSdrReplyAt: raw.lastSdrReplyAt,
    humanTakeover: raw.humanTakeover || false,
  };
}
