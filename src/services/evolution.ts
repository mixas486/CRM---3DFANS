const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log(`[Frontend] Chamando API interna: ${url}`);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    console.log(`[Frontend] Resposta de ${url}: ${response.status}`);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Sem resposta do servidor interno após ${timeoutMs/1000}s (Timeout)`);
    }
    throw err;
  }
};

export const createInstanceItem = async () => {
  const res = await fetchWithTimeout('/api/evolution/create', { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}: Erro ao criar instância`);
  }
  return res.json();
};

export const getConnectionState = async () => {
  const res = await fetchWithTimeout('/api/evolution/status');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}: Falha ao checar status`);
  }
  return res.json();
};

export const connectInstance = async () => {
  const res = await fetchWithTimeout('/api/evolution/connect');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}: Falha ao gerar QR`);
  }
  return res.json();
};

export const logoutInstance = async () => {
  const res = await fetchWithTimeout('/api/evolution/logout', { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}: Falha ao desconectar`);
  }
  return res.json();
};

export const fetchChats = async () => {
  const res = await fetch('/api/evolution/chats');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch chats');
  }
  return res.json();
};

export const fetchContacts = async () => {
  const res = await fetch('/api/evolution/contacts');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch contacts');
  }
  return res.json();
};

export const fetchMessages = async (remoteJid: string) => {
  const res = await fetch('/api/evolution/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: { remoteJid } })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch messages');
  }
  return res.json();
};

export const sendTextMessage = async (number: string, text: string) => {
    // number must be standard like 554899999999 without (+) or extra symbols
    const res = await fetch('/api/evolution/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            number,
            text
        }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send message');
    }
    return res.json();
};

export const sendMediaMessage = async (number: string, mediaUrl: string, mediatype: string = "image", caption?: string, fileName?: string) => {
    const res = await fetch('/api/evolution/sendMedia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            number,
            mediatype,
            media: mediaUrl,
            caption: caption || "",
            fileName: fileName || ""
        }),
    });
    if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || 'Failed to send media');
    }
    return res.json();
};

export const syncHistory = async () => {
    const res = await fetch('/api/evolution/sync-history', { method: 'POST' });
    if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || 'Falha ao sincronizar histórico');
    }
    return res.json();
};

export const setWebhook = async () => {
    const res = await fetch('/api/evolution/set-webhook', { method: 'POST' });
    if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || 'Falha ao configurar Webhook');
    }
    return res.json();
};
