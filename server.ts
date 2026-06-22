import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import { z } from "zod";
import { extractWhatsAppIdentity } from "./src/utils/whatsappIdentity";
import { isValidE164BR } from "./src/server/phoneUtils";
import { initRemoteLogging } from "./src/services/logging/logger";
import { adminDb } from "./src/server/firebase-admin";

const PORT = 3000;

// Initialize OpenAI conditionally. We won't crash if missing, just return error on /api/generate
let openaiClient: OpenAI | null = null;
const initOpenAI = () => {
  if (!openaiClient) {
    const key = process.env.OPENROUTER_API_KEY;
    if (key) {
      openaiClient = new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' });
    }
  }
  return openaiClient;
};

const GenerateRequestSchema = z.object({
  tipo: z.enum([
    "followup",
    "recuperacao",
    "promocao",
    "lancamento",
    "reativacao",
    "posvenda",
    "aniversario",
    "boasvindas",
  ]),
  contato: z.object({
    nome: z.string().optional(),
    produto: z.string().optional(),
    interesse: z.string().optional(),
  }),
  contexto: z.string().optional(),
});

async function startServer() {
  // Initialize Remote Logging
  await initRemoteLogging();

  const app = express();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Phone helpers for OUTBOUND sends. Numbers here are user-provided E164
  // strings (not webhook payloads). Inbound identity always goes through
  // extractWhatsAppIdentity() — never through these helpers.
  const normalizePhone = (input: any): string => {
    // Accepts a raw number/string OR a webhook-like body. Identity is always
    // resolved by the canonical extractor so we never derive a phone from @lid.
    if (typeof input === "string") {
      if (input.includes("@lid") || input.includes("@g.us")) return "";
      return input.replace("@s.whatsapp.net", "").replace(/[^\d]/g, "");
    }
    const { phoneE164 } = extractWhatsAppIdentity(input || {});
    return phoneE164;
  };

  const isValidPhone = (phone: string): boolean => isValidE164BR(phone);

  // Helper function to get Evolution API configuration
  const getEvolutionConfig = () => {
    const url = process.env.EVOLUTION_API_URL;
    const key = process.env.EVOLUTION_API_KEY || '3dfans123';
    const instance = process.env.EVOLUTION_INSTANCE || '3dfans';
    
    if (!url) {
      throw new Error('Evolution API credentials not configured: EVOLUTION_API_URL must be set in .env');
    }
    
    return {
      url: url.replace(/\/$/, ''),
      key,
      instance
    };
  };

  // Helper for Evolution Logging
  const logEvolution = (action: string, endpoint: string, data?: any) => {
    console.log(`\n[EVOLUTION ${action}] ${endpoint}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  };

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- Evolution API Proxy ---

  app.get("/api/evolution/chats", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();
      const endpoint = `${url}/chat/findChats/${instance}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error("/api/evolution/chats error:", e);
      res.status(500).json({ error: e.message || "Error fetching chats" });
    }
  });

  app.get("/api/evolution/contacts", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();
      const endpoint = `${url}/chat/findContacts/${instance}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error("/api/evolution/contacts error:", e);
      res.status(500).json({ error: e.message || "Error fetching contacts" });
    }
  });

  app.post("/api/evolution/messages", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();
      const endpoint = `${url}/chat/findMessages/${instance}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error("/api/evolution/messages error:", e);
      res.status(500).json({ error: e.message || "Error fetching messages" });
    }
  });

  app.post("/api/evolution/sendMedia", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();

      const { number, mediatype, media, caption, fileName } = req.body;
      const cleanNumber = normalizePhone(number);

      // Failsafe validation
      if (!isValidPhone(cleanNumber)) {
        console.error("[Proxy sendMedia SEND BLOCKED] Invalid phone number:", cleanNumber);
        return res.status(400).json({ 
          success: false, 
          error: `[SEND BLOCKED] O número de telefone "${cleanNumber}" é inválido. Envio para subcontas ou Jid/Lid/Group não permitido. Requer E164 começando com 55 e tamanho mínimo de 12 dígitos.` 
        });
      }

      console.log(`[Proxy sendMedia] Request body:`, {
        number: cleanNumber,
        mediatype,
        caption,
        fileName
      });

      const response = await fetch(`${url}/message/sendMedia/${instance}`, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: cleanNumber,
          mediatype: mediatype || "image",
          media: media,
          caption: caption || "",
          fileName: fileName || ""
        }),
      });

      const responseText = await response.text();
      console.log(`[Proxy sendMedia Response] Status: ${response.status} Body: ${responseText}`);

      let responseData = {};
      try {
        responseData = JSON.parse(responseText);
      } catch (err) {}

      res.status(response.status).json(responseData);
    } catch (e: any) {
      console.error("/api/evolution/sendMedia error:", e);
      res.status(500).json({ error: e.message || "Error sending media" });
    }
  });

  app.post("/api/evolution/create", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();

      const endpoint = `${url}/instance/create`;
      const payload = {
        instanceName: instance,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        token: key // Required in v2.3.7 to enforce matching API Key
      };
      logEvolution('REQUEST', `POST ${endpoint}`, payload);

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(id);

      const data = await response.json().catch(() => ({}));
      logEvolution('RESPONSE', `POST ${endpoint} [${response.status}]`, data);
      
      if (!response.ok && response.status !== 403) {
        // 403 might mean already exists in some evolution versions
        return res
          .status(response.status)
          .json({
            error:
              data.message ||
              data.error ||
              `HTTP Error ${response.status} URL: ${url}`,
          });
      }
      res.json(data);
    } catch (e: any) {
      logEvolution('ERROR', '/api/evolution/create', e.message);
      if (e.name === "AbortError")
        return res.status(504).json({ error: "Evolution API timeout (15s)" });
      res.status(500).json({ error: e.message || "Error creating instance" });
    }
  });

  // --- Click Tracking Route ---
  app.get("/api/track/:trackId", async (req, res) => {
    try {
      const { trackId } = req.params;
      const { collection, doc, getDoc, updateDoc, increment, setDoc } = await import("firebase/firestore");
      const { serverDb } = await import("./src/server/firebase.ts");

      console.log(`[Click Tracking] Redirecting click: ${trackId}`);
      const trackRef = doc(collection(serverDb, "click_tracking"), trackId);
      const trackSnap = await getDoc(trackRef);

      if (!trackSnap.exists()) {
        console.warn(`[Click Tracking] ID ${trackId} not found in Firestore. Redirecting to backup.`);
        return res.redirect("https://miniaturas.3dfans.pro");
      }

      const trackData = trackSnap.data();
      const contactId = trackData.contactId || "";
      const destination = trackData.destinationUrl || "https://miniaturas.3dfans.pro";

      // 1. Increment clicks on track doc
      await updateDoc(trackRef, {
        clicks: increment(1),
        lastClickedAt: Date.now()
      });

      // 2. Scale up leadScore of the contact with +15 points
      if (contactId) {
        console.log(`[Click Tracking] Scaling up score of contact ID ${contactId}`);
        const contactRef = doc(collection(serverDb, "contacts"), contactId);
        const contactSnap = await getDoc(contactRef);
        if (contactSnap.exists()) {
          const cData = contactSnap.data();
          const currentScore = (Number(cData.leadScore) || 20) + 15;
          const notesHistory = (cData.notes || "") + `\n[IA System: Clicou em link de tracking em ${new Date().toLocaleString()}]`;
          await updateDoc(contactRef, {
            leadScore: currentScore,
            valorEstimado: currentScore * 15,
            notes: notesHistory,
            lastContactAt: Date.now()
          });

          // Log click tracking event in campaign logs
          const clicksLogsRef = doc(collection(serverDb, "campaign_logs"));
          await setDoc(clicksLogsRef, {
            id: clicksLogsRef.id,
            contactId,
            nome: cData.nome || "Lead",
            telefoneE164: cData.telefoneE164 || "",
            status: "ativo",
            message: `Lead clicou no link rastreável: ${trackData.originalUrl || "miniaturas"}`,
            timestamp: Date.now()
          });
        }
      }

      // 3. Perform redirect
      return res.redirect(destination);
    } catch (e: any) {
      console.error("[Click Tracking] Redirect processing failure:", e);
      return res.redirect("https://miniaturas.3dfans.pro");
    }
  });

  // Webhook Receiver
  const { handleEvolutionWebhook } =
    await import("./src/server/webhook.ts").catch((e) => {
      console.error("Failed to load webhook route:", e);
      return {
        handleEvolutionWebhook: (req: any, res: any) =>
          res.status(200).send("OK"),
      };
    });

  // Canonical Webhook Route (matching common Evolution API config)
  app.post("/webhook/evolution", async (req, res) => {
    console.log('[WEBHOOK RAW BODY - /webhook/evolution]');
    console.log(JSON.stringify(req.body, null, 2));
    await handleEvolutionWebhook(req, res);
  });

  app.post("/api/webhook/evolution", async (req, res) => {
    console.log('[WEBHOOK RAW BODY - /api/webhook/evolution]');
    console.log(JSON.stringify(req.body, null, 2));
    await handleEvolutionWebhook(req, res);
  });

  app.post("/api/evolution/webhook", async (req, res) => {
    console.log('[WEBHOOK RAW BODY - /api/evolution/webhook]');
    console.log(JSON.stringify(req.body, null, 2));
    await handleEvolutionWebhook(req, res);
  });

  app.get("/api/evolution/status", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();
      const endpoint = `${url}/instance/connectionState/${instance}`;
      
      logEvolution('REQUEST', `GET ${endpoint}`);
      
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(endpoint, {
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(id);

      const data = await response.json().catch(() => ({}));
      logEvolution('RESPONSE', `GET ${endpoint} [${response.status}]`, data);
      
      if (!response.ok) {
        return res
          .status(response.status)
          .json({
            error:
              data.message ||
              data.error ||
              `HTTP Error ${response.status} URL: ${url}`,
          });
      }
      res.json(data);
    } catch (e: any) {
      logEvolution('ERROR', '/api/evolution/status', e.message);
      if (e.name === "AbortError")
        return res.status(504).json({ error: "Evolution API timeout (15s)" });
      res.status(500).json({ error: e.message || "Error fetching status" });
    }
  });

  // Media Proxy to retrieve encrypted WhatsApp media via Evolution API
  app.get("/api/evolution/media-proxy", async (req, res) => {
    try {
      const { instance, msgId } = req.query;
      if (!instance || !msgId) {
        return res.status(400).send("Missing instance or msgId");
      }

      console.log(`[Media Proxy] Request for msgId: ${msgId} in instance: ${instance}`);

      // 1. Get message from Firestore using Admin SDK (bypasses security rules)
      const msgSnap = await adminDb.collection("messages").doc(String(msgId)).get();

      if (!msgSnap.exists) {
        console.error(`[Media Proxy] Message ${msgId} not found in Firestore`);
        return res.status(404).send("Message not found");
      }

      const msgData = msgSnap.data()!;

      // If message already has a persistent GCS/storage URL, redirect to it
      const persistentUrl: string = msgData.mediaUrl || '';
      if (
        persistentUrl &&
        !persistentUrl.includes('whatsapp.net') &&
        !persistentUrl.includes('whatsapp.com')
      ) {
        console.log(`[Media Proxy] Redirecting to persistent URL: ${persistentUrl}`);
        return res.redirect(302, persistentUrl);
      }

      if (!msgData.messageContent) {
        console.error(`[Media Proxy] No messageContent found for ${msgId}`);
        return res.status(404).send("Media content metadata missing");
      }

      // 2. Call Evolution API to decrypt and get base64
      const { url, key } = getEvolutionConfig();
      const endpoint = `${url}/chat/getBase64FromMediaMessage/${instance}`;

      console.log(`[Media Proxy] Calling Evolution API: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: msgData.messageContent }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Media Proxy] Evolution API error: ${response.status} ${errText}`);
        return res.status(502).send("Failed to retrieve media from WhatsApp");
      }

      const data = await response.json();
      const base64 = data.base64 || data.data;

      if (!base64) {
        console.error(`[Media Proxy] No base64 returned from Evolution API`);
        return res.status(404).send("Media data not returned");
      }

      // 3. Detect mimetype — messageContent stores { key, message: { audioMessage: {...} } }
      const mc = msgData.messageContent?.message || msgData.messageContent || {};
      const mimetype =
        mc.audioMessage?.mimetype ||
        mc.imageMessage?.mimetype ||
        mc.videoMessage?.mimetype ||
        mc.documentMessage?.mimetype ||
        mc.stickerMessage?.mimetype ||
        "audio/ogg; codecs=opus";

      const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
      const buffer = Buffer.from(base64Data, "base64");

      res.setHeader("Content-Type", mimetype);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buffer);

      console.log(`[Media Proxy] Served ${mimetype} (${buffer.length} bytes) for ${msgId}`);

    } catch (e: any) {
      console.error("[Media Proxy Error]", e);
      res.status(500).send(e.message || "Internal Server Error");
    }
  });

  app.get("/api/evolution/connect", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();
      const endpoint = `${url}/instance/connect/${instance}`;

      logEvolution('REQUEST', `GET ${endpoint}`);
      
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(endpoint, {
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(id);

      const data = await response.json().catch(() => ({}));
      logEvolution('RESPONSE', `GET ${endpoint} [${response.status}]`, data);
      
      if (!response.ok) {
        return res
          .status(response.status)
          .json({
            error:
              data.message ||
              data.error ||
              `HTTP Error ${response.status} URL: ${url}`,
          });
      }
      res.json(data);
    } catch (e: any) {
      logEvolution('ERROR', '/api/evolution/connect', e.message);
      if (e.name === "AbortError")
        return res.status(504).json({ error: "Evolution API timeout (15s)" });
      res.status(500).json({ error: e.message || "Error getting QR code" });
    }
  });

  app.delete("/api/evolution/logout", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();
      const endpoint = `${url}/instance/logout/${instance}`;

      logEvolution('REQUEST', `DELETE ${endpoint}`);
      
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(id);

      const data = await response.json().catch(() => ({}));
      logEvolution('RESPONSE', `DELETE ${endpoint} [${response.status}]`, data);
      
      if (!response.ok) {
        return res.status(response.status).json(data);
      }
      res.json(data);
    } catch (e: any) {
      logEvolution('ERROR', '/api/evolution/logout', e.message);
      if (e.name === "AbortError")
        return res.status(504).json({ error: "Evolution API timeout (15s)" });
      res.status(500).json({ error: e.message || "Error logging out" });
    }
  });

  app.post("/api/evolution/sendText", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();
      const endpoint = `${url}/message/sendText/${instance}`;

      const { number, text, delay, linkPreview } = req.body;
      const cleanNumber = normalizePhone(number);

      // Failsafe validation
      if (!isValidPhone(cleanNumber)) {
        return res.status(400).json({ 
          success: false, 
          error: `[SEND BLOCKED] O número de telefone "${cleanNumber}" é inválido. Envio para subcontas ou Jid/Lid/Group não permitido. Requer E164 começando com 55 e tamanho mínimo de 12 dígitos.` 
        });
      }

      const payload = {
        number: cleanNumber,
        text: text,
        delay: delay || 1200,
        linkPreview: linkPreview !== undefined ? linkPreview : false,
        options: {
          checkNumber: false,
          verifyNumber: false
        }
      };
      
      logEvolution('REQUEST', `POST ${endpoint}`, payload);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); } catch(e) { data = responseText; }
      
      if (!response.ok) logEvolution('ERROR', `POST ${endpoint}`, data);
      else logEvolution('RESPONSE', `POST ${endpoint} [${response.status}]`, data);

      let responseData = {};
      try {
        responseData = JSON.parse(responseText);
      } catch (err) {}

      res.status(response.status).json(responseData);
    } catch (e: any) {
      console.error("/api/evolution/sendText error:", e);
      res.status(500).json({ error: e.message || "Error sending message" });
    }
  });

  app.post("/api/evolution/set-webhook", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const baseUrl = `${protocol}://${req.headers.host}`;
      const webhookUrl = `${baseUrl}/api/webhook/evolution`;

      const endpoint = `${url}/webhook/set/${instance}`;
      const payload = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "CONTACTS_UPDATE",
            "CONTACTS_UPSERT",
            "PRESENCE_UPDATE",
            "CONNECTION_UPDATE"
          ]
        }
      };

      logEvolution('REQUEST', `POST ${endpoint}`, payload);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      logEvolution('RESPONSE', `POST ${endpoint} [${response.status}]`, data);

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.message || data.error || `HTTP Error ${response.status}`,
          success: false
        });
      }

      res.json({ success: true, message: "Webhook configurado com sucesso!", data });
    } catch (e: any) {
      logEvolution('ERROR', '/api/evolution/set-webhook', e.message);
      res.status(500).json({ error: e.message || "Error setting webhook" });
    }
  });

  // --- Evolution Diagnostics Endpoints ---

  app.get("/api/evolution/healthcheck", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();

      console.log(`[Diagnostic] Healthcheck starting for ${url}`);

      // 1. Try fetching status
      const endpoint = `${url}/instance/connectionState/${instance}`;
      const response = await fetch(endpoint, {
        headers: { apikey: key, "Content-Type": "application/json" }
      });
      const data = await response.json().catch(() => ({}));

      res.json({
        success: true,
        hostReachable: true,
        message: "Evolution API is reachable and responding.",
        instance,
        url,
        connectionState: data?.instance?.state || "offline",
        response: data
      });
    } catch (e: any) {
      console.error("[Diagnostic Error] Evolution healthcheck failed:", e);
      res.status(500).json({
        success: false,
        hostReachable: false,
        message: "Evolution API is unreachable or returned error.",
        error: e.message || e
      });
    }
  });

  app.get("/api/evolution/connectionState", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();

      const endpoint = `${url}/instance/connectionState/${instance}`;
      const response = await fetch(endpoint, {
        headers: { apikey: key, "Content-Type": "application/json" }
      });
      const data = await response.json().catch(() => ({}));

      // Write status to firestore if database exists
      try {
        const { serverDb } = await import("./src/server/firebase.ts");
        const { collection, doc, setDoc } = await import("firebase/firestore");
        const statusRef = doc(collection(serverDb, "system"), "evolution_status");
        await setDoc(statusRef, {
          state: data?.instance?.state || "disconnected",
          updatedAt: Date.now()
        }, { merge: true });
      } catch (fErr) {
        console.warn("[Diagnostic] Could not log status in Firestore:", fErr);
      }

      res.json(data);
    } catch (e: any) {
      console.error("[Diagnostic Error] connectionState fetch failed:", e);
      res.status(500).json({ error: e.message || e });
    }
  });

  app.post("/api/evolution/testSend", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();

      const { number, text } = req.body;
      const cleanNumber = normalizePhone(number);

      if (!cleanNumber || !text) {
        return res.status(400).json({ error: "Missing number or text in payload" });
      }

      // Failsafe validation
      if (!isValidPhone(cleanNumber)) {
        console.error("[Proxy testSend SEND BLOCKED] Invalid phone number:", cleanNumber);
        return res.status(400).json({ 
          success: false, 
          error: `[SEND BLOCKED] O número de telefone "${cleanNumber}" é inválido. Requer E164 começando com 55 e tamanho mínimo de 12 dígitos.` 
        });
      }

      console.log(`[Diagnostic testSend] Sending test to number: ${cleanNumber}`);

      const endpoint = `${url}/message/sendText/${instance}`;
      const payload = {
        number: cleanNumber,
        text: text,
        delay: 1200,
        linkPreview: false,
        options: { checkNumber: false, verifyNumber: false }
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let responseData = {};
      try { responseData = JSON.parse(responseText); } catch {}

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: "Evolution API rejected message",
          response: responseData
        });
      }

      res.json({
        success: true,
        message: "Test message sent successfully via Evolution API.",
        cleanNumber,
        response: responseData
      });
    } catch (e: any) {
      console.error("[Diagnostic Error] testSend endpoint failed:", e);
      res.status(500).json({ success: false, error: e.message || e });
    }
  });

  app.post("/api/evolution/testWebhook", async (req, res) => {
    try {
      const { number, text } = req.body;
      const cleanNumber = normalizePhone(number || "557398328844");
      const textToSimulate = text || "Oi, gostaria de uma miniatura premium da 3DFANS!";

      console.log(`[Diagnostic testWebhook] Simulating message upsert for: ${cleanNumber}`);

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const baseUrl = `${protocol}://${req.headers.host}`;

      const { handleEvolutionWebhook } = await import("./src/server/webhook.ts");

      // Construct simulated MESSAGE_UPSERT request body mimicking Evolution payload
      const simulatedPayload = {
        event: "messages.upsert",
        instance: process.env.EVOLUTION_INSTANCE || "3dfans",
        data: {
          key: {
            remoteJid: `${cleanNumber}@s.whatsapp.net`,
            fromMe: false,
            id: "SIM_" + Math.random().toString(36).substring(2, 11)
          },
          pushName: "Test Lead User",
          message: {
            conversation: textToSimulate
          },
          messageTimestamp: Math.floor(Date.now() / 1000)
        }
      };

      // Create simulated mock req/res
      let sEnded = false;
      let sStatus = 200;
      let sBody = "";

      const mockReq = {
        body: simulatedPayload,
        headers: req.headers
      };
      const mockRes = {
        status: (code: number) => {
          sStatus = code;
          return mockRes;
        },
        send: (bodyText: string) => {
          sEnded = true;
          sBody = bodyText;
          return mockRes;
        }
      };

      await handleEvolutionWebhook(mockReq, mockRes);

      res.json({
        success: true,
        message: "Simulated messages.upsert payload processed by local Webhook & AI engines.",
        simulatedPayload,
        webhookStatus: sStatus,
        webhookBody: sBody
      });
    } catch (e: any) {
      console.error("[Diagnostic Error] testWebhook endpoint failed:", e);
      res.status(500).json({ success: false, error: e.message || e });
    }
  });

  app.post("/api/evolution/sync-history", async (req, res) => {
    try {
      const { url, key, instance } = getEvolutionConfig();

      console.log(
        `[Sync] Resandboxando/rebootando a instância para forçar sincronização via webhook: ${instance}`
      );

      // 1. Reset sync stats in Firestore
      const { serverDb } = await import("./src/server/firebase.ts");
      const { collection, doc, setDoc } = await import("firebase/firestore");

      const syncRef = doc(collection(serverDb, "system"), "sync_status");
      await setDoc(syncRef, {
        status: "syncing",
        chatsCount: 0,
        messagesCount: 0,
        contactsCount: 0,
        lastSyncAt: Date.now(),
        updatedAt: Date.now()
      });

      // 2. Trigger restart/reboot of instance in Evolution API to initiate connection lifecycle & full sync events
      const endpoint = `${url}/instance/restart/${instance}`;
      logEvolution('REQUEST', `POST ${endpoint}`);
      let response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: key,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const rebootEndpoint = `${url}/instance/reboot/${instance}`;
        console.log(
          `[Sync] Restart falhou com HTTP ${response.status}. Tentando /reboot...`
        );
        logEvolution('REQUEST', `POST ${rebootEndpoint}`);
        const rebootResponse = await fetch(rebootEndpoint, {
          method: "POST",
          headers: {
            apikey: key,
            "Content-Type": "application/json"
          }
        });
        response = rebootResponse;
      }

      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn(`[Sync] Reboot/restart recusado pela API: `, responseData);
        return res.status(response.status).json({
          error:
            responseData.message ||
            responseData.error ||
            `HTTP ${response.status}`,
          success: false
        });
      }

      console.log(
        `[Sync] Comando de reinicialização aceito. Chats, contatos e mensagens serão carregados via webhooks em background.`
      );
      res.json({ success: true, message: "Reboot efetuado com sucesso." });
    } catch (e: any) {
      console.error("/api/evolution/sync-history error:", e);
      res
        .status(500)
        .json({ error: e.message || "Erro durante a sincronização" });
    }
  });

  // --- Real WhatsApp Contacts Sync Endpoint ---
  app.post("/api/evolution/sync-contacts", async (req, res): Promise<any> => {
    try {
      const { collection, doc, getDocs, writeBatch, setDoc, getDoc } = await import("firebase/firestore");
      const { serverDb } = await import("./src/server/firebase.ts");

      console.log("[WA Contacts Sync Started] Sincronizador de contatos disparado!");

      const progressRef = doc(collection(serverDb, "system"), "sync_contacts_progress");

      const updateProgress = async (fields: any) => {
        try {
          await setDoc(progressRef, {
            ...fields,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (err) {
          console.error("[WA Sync Progress Error] Falha ao atualizar doc de progresso:", err);
        }
      };

      // 1. Inicializar progresso
      const startedAt = Date.now();
      await updateProgress({
        status: "running",
        total: 0,
        processed: 0,
        created: 0,
        updated: 0,
        failed: 0,
        progress: 0,
        startedAt,
        logs: ["[WA Contacts Sync Started] Conectando ao painel e buscando contatos do celular..."],
        error: ""
      });

      res.status(202).json({ success: true, message: "Sync process started in background." });

      // Executa em background para não travar a porta HTTP e causar "Failed to fetch" no React Timeout
      (async () => {
        try {
          const { url: evolutionUrl, key: evolutionKey, instance: evolutionInstance } = getEvolutionConfig();
          const url = evolutionUrl;
          const key = evolutionKey;
          const instance = evolutionInstance;

      let rawList: any[] = [];
      let isFallback = false;

      // DDD map for state identification
      const dddStateMap: Record<string, string> = {
        '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
        '21': 'RJ', '22': 'RJ', '24': 'RJ',
        '27': 'ES', '28': 'ES',
        '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
        '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
        '47': 'SC', '48': 'SC', '49': 'SC',
        '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
        '61': 'DF', '62': 'GO', '64': 'GO', '63': 'TO',
        '65': 'MT', '66': 'MT', '67': 'MS', '68': 'AC', '69': 'RO',
        '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA', '79': 'SE',
        '81': 'PE', '87': 'PE', '82': 'AL', '83': 'PB', '84': 'RN',
        '85': 'CE', '88': 'CE', '86': 'PI', '89': 'PI',
        '91': 'PA', '93': 'PA', '94': 'PA', '92': 'AM', '97': 'AM',
        '95': 'RR', '96': 'AP', '98': 'MA', '99': 'MA'
      };

      const getBRState = (phone: string): string => {
        const digits = phone.replace(/\D/g, "");
        let ddd = "";
        if (digits.startsWith("55") && digits.length >= 7) {
          ddd = digits.substring(2, 4);
        } else if (digits.length >= 4) {
          ddd = digits.substring(0, 2);
        }
        return dddStateMap[ddd] || "";
      };

      // 2. Fetch from Evolution API adapting to multiple v2 endpoints
      try {
        const endpoints = [
          { name: "POST_FIND_CONTACTS", url: `${url}/chat/findContacts/${instance}`, method: "POST" },
          { name: "GET_FIND_CONTACTS", url: `${url}/chat/findContacts/${instance}`, method: "GET" },
          { name: "GET_CONTACTS", url: `${url}/contacts`, method: "GET" },
          { name: "GET_CHAT_CONTACTS", url: `${url}/chat/contacts`, method: "GET" },
          { name: "POST_FIND_CHATS", url: `${url}/chat/findChats/${instance}`, method: "POST" },
          { name: "GET_FIND_CHATS", url: `${url}/chat/findChats/${instance}`, method: "GET" }
        ];

        for (const ep of endpoints) {
          try {
            console.log(`[WA Contacts Sync] Tentando endpoint: ${ep.method} ${ep.url}`);
            const response = await fetch(ep.url, {
              method: ep.method,
              headers: {
                apikey: key,
                "Content-Type": "application/json"
              },
              signal: AbortSignal.timeout(5000),
              ...(ep.method === "POST" ? { body: JSON.stringify({}) } : {})
            });

            if (response.ok) {
              const resData = await response.json();
              const possibleList = Array.isArray(resData) ? resData : (resData.data || []);
              if (possibleList.length > 0) {
                rawList = possibleList;
                console.log(`[WA Contacts Sync] Resgate bem sucedido no endpoint ${ep.name}. Total: ${rawList.length} registros.`);
                break;
              }
            }
          } catch (endpointErr) {
            console.warn(`[WA Contacts Sync] Falha ao consultar endpoint ${ep.name}:`, endpointErr);
          }
        }
      } catch (fetchErr: any) {
        console.error("[WA Contacts Sync Exception] Falha ao bater na API da Evolution:", fetchErr);
      }

      // 3. Fallback inteligente se a lista veio vazia
      if (rawList.length === 0) {
        isFallback = true;
        console.warn("[WA Contacts Sync] Lista da API vazia ou inacessível. Executando fallback offline via Banco de Dados local...");
        await updateProgress({
          logs: [
            "[WA Contacts Sync Started] Conectando ao painel e buscando contatos do celular...",
            "[WA Contacts Sync] Evolution API retornou vazia ou em manutenção. Puxando base offline por Chats salvos no CRM..."
          ]
        });

        const fallbackContacts: any[] = [];
        const uniqueJids = new Set<string>();

        // Carregar da coleção chats
        try {
          console.log("[WA Contacts Sync] Loading chats fallback...");
          const chatsSnap = await getDocs(collection(serverDb, "chats"));
          console.log("[WA Contacts Sync] Loaded chats fallback. Size:", chatsSnap.size);
          chatsSnap.forEach((d) => {
            const data = d.data();
            // Telefone REAL do chat: prioriza telefoneE164 salvo; nunca deriva do @lid.
            const phoneDigits = String(data.telefoneE164 || "").replace(/[^\d]/g, "");
            if (!phoneDigits || uniqueJids.has(phoneDigits)) return;

            // Ignora chats que só têm remoteJid @lid e nenhum telefone real resolvido.
            if (!phoneDigits) return;

            uniqueJids.add(phoneDigits);
            fallbackContacts.push({
              // sender com JID canônico derivado do TELEFONE -> extractWhatsAppIdentity resolve certo.
              sender: `${phoneDigits}@s.whatsapp.net`,
              // remoteJid preservado como está no banco (pode ser @lid), sem reconstrução.
              remoteJid: data.remoteJid || `${phoneDigits}@s.whatsapp.net`,
              name: data.contactName || data.pushName || "",
              profilePicUrl: data.profilePicUrl || ""
            });
          });
        } catch (chatFallbackErr) {
          console.error("[WA Sync Chat Fallback Error]:", chatFallbackErr);
        }

        rawList = fallbackContacts;
      }

      console.log(`[WA Contacts Sync] Resolvidos ${rawList.length} contatos brutos.`);

      // 4. Carregar todo mapa de contatos atuais do CRM para deduplicação em memória (Economia extrema de cota e performance)
      console.log("[WA Contacts Sync] Loading contacts for in-memory deduplication...");
      const contactsSnap = await getDocs(collection(serverDb, "contacts"));
      console.log("[WA Contacts Sync] Loaded existing contacts. Size:", contactsSnap.size);
      const activeContactsMap = new Map<string, any>();
      contactsSnap.forEach((doc) => {
        const cData = doc.data();
        const rawKey = cData.telefoneRaw;
        const e164Key = cData.telefoneE164;
        if (rawKey) activeContactsMap.set(String(rawKey), { id: doc.id, ...cData });
        if (e164Key) activeContactsMap.set(String(e164Key), { id: doc.id, ...cData });
      });

      // 5. Parse, normalização e remoção de duplicados na lista de entrada.
      //    Usa SEMPRE o extrator canônico: phoneE164 vem do sender, nunca do @lid.
      const parsedContacts: any[] = [];
      const outLogs = [
        `[WA Contacts Sync] ${rawList.length} registros capturados. Iniciando tratamento de telefonia...`
      ];

      for (const item of rawList) {
        const identity = extractWhatsAppIdentity(item);

        // Pula grupos e qualquer item sem telefone real resolvido (inclui @lid sem sender).
        if (identity.isGroup || !identity.phoneE164 || !isValidE164BR(identity.phoneE164)) {
          console.warn('[INVALID PHONE SKIPPED]', item?.remoteJid || item?.jid || item?.id || '');
          continue;
        }

        const cleaned = identity.phoneE164;          // ex: 557398328844
        const cleanE164Value = "+" + cleaned;        // ex: +557398328844

        const name = item.name || item.pushName || item.pushname || item.verifiedName || "";
        const finalName = name.trim() ? name.trim() : `WhatsApp Lead ${cleaned.slice(-4)}`;
        const avatarUrl = item.profilePicUrl || item.profile || item.avatarUrl || item.avatar || "";

        // Evitar adicionar o mesmo número duas vezes na fila que vamos gravar
        if (parsedContacts.some((p) => p.telefoneRaw === cleaned)) {
          continue;
        }

        console.log('[WHATSAPP PARSED]', {
          remoteJid: identity.remoteJid,
          extractedPhone: cleaned,
          pushName: finalName
        });

        parsedContacts.push({
          telefoneRaw: cleaned,
          telefoneE164: cleanE164Value,
          name: finalName,
          avatarUrl,
          // remoteJid preservado exatamente como veio (pode ser @lid); NUNCA reconstruído.
          remoteJid: identity.remoteJid,
          // JID canônico derivado do TELEFONE, nunca do @lid.
          canonicalJid: `${cleaned}@s.whatsapp.net`
        });
      }


      const totalToSync = parsedContacts.length;
      outLogs.push(`[WA Contact Parsed] ${totalToSync} números únicos e válidos normalizados.`);

      await updateProgress({
        total: totalToSync,
        logs: outLogs
      });

      let created = 0;
      let updated = 0;
      let failed = 0;
      let processed = 0;

      const BATCH_LIMIT = 100;
      for (let i = 0; i < parsedContacts.length; i += BATCH_LIMIT) {
        const chunk = parsedContacts.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(serverDb);

        for (const cnt of chunk) {
          try {
            processed++;
            const stateCode = getBRState(cnt.telefoneE164);
            
            // Busca o contato correspondente no cache em memória
            const existingInDb = activeContactsMap.get(cnt.telefoneE164) || activeContactsMap.get(cnt.telefoneRaw);

            if (existingInDb) {
              const contactRef = doc(collection(serverDb, "contacts"), existingInDb.id);
              
              const updatedPayload: any = {
                pushName: cnt.name,
                avatarUrl: cnt.avatarUrl || existingInDb.avatarUrl || "",
                updatedAt: Date.now(),
                whatsappLinked: true,
                remoteJid: cnt.remoteJid,
                canonicalJid: cnt.canonicalJid,
                instanceId: instance
              };

              // No overwrite of customized manual names by placeholder names
              const currentName = existingInDb.nome || "";
              if (!currentName || currentName.includes("Desconhecido") || currentName.includes("Lead")) {
                updatedPayload.nome = cnt.name;
              }

              batch.set(contactRef, updatedPayload, { merge: true });
              
              // chatId canônico = instance:telefone (mesmo formato do webhook). NUNCA o @lid.
              const chatId = `${instance}:${cnt.telefoneRaw}`;
              const chatRef = doc(collection(serverDb, "chats"), chatId);
              batch.set(chatRef, {
                 remoteJid: cnt.remoteJid,
                 canonicalJid: cnt.canonicalJid,
                 telefoneE164: cnt.telefoneE164,
                 pushName: cnt.name,
                 contactName: cnt.name,
                 unreadCount: 0,
                 lastMessage: 'Contato sincronizado',
                 lastMessageAt: Date.now(),
                 instanceId: instance,
                 updatedAt: Date.now()
              }, { merge: true });
              
              updated++;
              console.log(`[WA Contact Upserted] Merge: ${cnt.telefoneE164} merged to doc ID ${existingInDb.id}`);
            } else {
              const contactRef = doc(collection(serverDb, "contacts"));
              
              const newDocPayload = {
                id: contactRef.id,
                nome: cnt.name,
                telefoneRaw: cnt.telefoneRaw,
                telefoneE164: cnt.telefoneE164,
                pushName: cnt.name,
                avatarUrl: cnt.avatarUrl,
                stage: "Novo Lead",
                leadScore: 20,
                leadCategory: "Contato via WhatsApp",
                optIn: true,
                tags: ["origem:whatsapp_sync"],
                cidade: "",
                estado: stateCode,
                notes: "Importado via Sincronização Inteligente do WhatsApp",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastContactAt: null,
                source: "whatsapp_sync",
                whatsappLinked: true,
                status: "active",
                needsReview: false,
                remoteJid: cnt.remoteJid,
                canonicalJid: cnt.canonicalJid,
                instanceId: instance
              };

              batch.set(contactRef, newDocPayload);
              
              // chatId canônico = instance:telefone (mesmo formato do webhook). NUNCA o @lid.
              const chatId = `${instance}:${cnt.telefoneRaw}`;
              const chatRef = doc(collection(serverDb, "chats"), chatId);
              batch.set(chatRef, {
                 remoteJid: cnt.remoteJid,
                 canonicalJid: cnt.canonicalJid,
                 telefoneE164: cnt.telefoneE164,
                 pushName: cnt.name,
                 contactName: cnt.name,
                 unreadCount: 0,
                 lastMessage: 'Contato sincronizado',
                 lastMessageAt: Date.now(),
                 instanceId: instance,
                 updatedAt: Date.now()
              }, { merge: true });
              
              created++;
              console.log(`[WA Contact Upserted] Created: ${cnt.telefoneE164} created with doc ID ${contactRef.id}`);
            }
          } catch (chunkItemErr: any) {
            failed++;
            console.error(`[WA Contact Upserted Error] Processing chunk item exception: `, chunkItemErr);
          }
        }

        // Commit chunk
        await batch.commit();

        const progressPercent = Math.min(100, Math.round((processed / totalToSync) * 100));
        const runningLogs = [
          ...outLogs,
          `[WA Contact Upserted] Gravado lote de contatos no Firestore: ${processed}/${totalToSync} processados.`
        ];

        await updateProgress({
          processed,
          created,
          updated,
          failed,
          progress: progressPercent,
          logs: runningLogs.slice(-30) // Mantém os últimos 30 logs ativos em memória de render
        });
      }

      const endLogs = [
        ...outLogs,
        `[WA Sync Completed] Sincronização finalizada com êxito!`,
        `[WA Sync Completed] Total de números tratados: ${totalToSync}`,
        `[WA Sync Completed] Novos leads gerados no funil: ${created}`,
        `[WA Sync Completed] Leads já catalogados enriquecidos: ${updated}`,
        `[WA Sync Completed] Falhas durante gravação: ${failed}`
      ];

      await updateProgress({
        status: "completed",
        processed: totalToSync,
        created,
        updated,
        failed,
        progress: 100,
        logs: endLogs,
        error: ""
      });

      console.log(`[WA Sync Completed] Sincronização de contatos executada com 100% de sucesso!`);
      // Não enviamos res.json() aqui porque a porta já foi liberada

        } catch (realErr: any) {
          console.error("[WA Sync Failed] Falha catastrófica no sync-contacts handler do Express:", realErr);
          
          try {
            const { collection, doc, setDoc } = await import("firebase/firestore");
            const { serverDb } = await import("./src/server/firebase.ts");
            const progressRef = doc(collection(serverDb, "system"), "sync_contacts_progress");
            await setDoc(progressRef, {
              status: "failed",
              error: realErr.message || "Erro catastrófico indefinido no servidor.",
              updatedAt: Date.now()
            }, { merge: true });
          } catch (_) {}
        }
      })();

    } catch (realErr: any) {
      console.error("[WA Sync Init Failed]:", realErr);
      res.status(500).json({ error: realErr.message || "Falha ao inicializar sincronização." });
    }
  });

  // --- Real AI Simulator Sandbox Endpoint ---
  app.post("/api/evolution/test-ai", async (req, res): Promise<any> => {
    try {
      const { clientMessage, personality, tone, sellingAggression, cta, emojis } = req.body;
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(400).json({ error: "Chave GEMINI_API_KEY não configurada no ambiente." });
      }

      const { GoogleGenAI, Type } = await import("@google/genai");
      const aiClient = new GoogleGenAI({ apiKey: key });

      const prompt = `Você é um simulador interativo de Inteligência Artificial Comercial Premium para a empresa 3DFANS.
As configurações de personalidade da Inteligência Artificial comercial são:
- Nome comercial: Especialista IA 3DFANS
- Personalidade/Abordagem: ${personality || "Vendedor prestativo, empático e de alto valor"}
- Tom de Voz preferido: ${tone || "Amigável, acolhedor e focado no cliente"}
- Nível de Agressividade Comercial: ${sellingAggression || "Moderado (Sugerir links úteis de forma sutil)"}
- CTA Principal das mensagens: ${cta || "Incentivar clique no visualizador 3D: https://miniaturas.3dfans.pro"}
- Uso de Emojis: ${emojis || "Frequente, porém com leveza"}

Sua função é gerar as métricas preditivas de pós-recebimento da mensagem do Lead e responder de forma coerente.

MENSAGEM ENVIADA PELO LEAD/CLIENTE:
"${clientMessage || "Oi, gostaria de um orçamento!"}"

Gere um objeto JSON estrito com os parâmetros correspondentes. Não inclua códigos adicionais ou marcações markdown de início ou fim de JSON.

Esquema JSON Esperado:
{
  "replyText": "Resposta gerada de forma altamente comercial, respeitando as configurações acima.",
  "intent": "Melhor intenção detectada entre: 'intenção compra', 'intenção orçamento', 'interesse empresarial', 'produção em massa', 'suporte', 'reclamação', 'curiosidade'",
  "leadScoreEstimated": 25,
  "suggestedStage": "Interessado"
}`;

      const modelName = "gemini-2.5-flash";
      console.log('[GEMINI MODEL]', modelName);
      const result = await aiClient.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              replyText: { type: Type.STRING },
              intent: { type: Type.STRING },
              leadScoreEstimated: { type: Type.INTEGER },
              suggestedStage: { type: Type.STRING }
            },
            required: ["replyText", "intent", "leadScoreEstimated", "suggestedStage"]
          }
        }
      });

      const parsed = JSON.parse(result.text || "{}");
      res.json({
        success: true,
        ...parsed
      });
    } catch (err: any) {
      console.error("[Test AI Error] Failed to complete live simulation.");
      const errorMessage = typeof err?.message === 'string' && err.message.includes('Permission denied') 
          ? 'Chave do Gemini suspensa ou sem permissão.' 
          : 'Erro desconhecido na geração do Gemini.';
      res.status(500).json({ error: errorMessage });
    }
  });

  // --- End Evolution API Proxy ---

  // Simple in-memory rate limiting: Max 20 requests per IP per minute
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => requestCounts.clear(), 60000); // Clear every minute to prevent memory leak

  const VariationRequestSchema = z.object({
    matriz: z.string(),
    contato: z.object({
      nome: z.string().optional(),
      produto: z.string().optional(),
      interesse: z.string().optional(),
    }),
    model: z.string().optional(),
  });

  app.post("/api/generate-variation", async (req, res): Promise<any> => {
    try {
      const openai = initOpenAI();
      if (!openai) {
        return res.status(500).json({
          error:
            "OPENROUTER_API_KEY environment variable is required to generate variations.",
        });
      }

      const parsed = VariationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }

      const { matriz, contato, model } = parsed.data;

      const prompt = `Você é um assistente de vendas brasileiro adaptando campanhas de WhatsApp.
Mensagem Matriz:
"""
${matriz}
"""

Dados do Contato:
Nome: ${contato.nome || "Amigo(a)"}
Produto de interesse: ${contato.produto || "não especificado"}
Assunto: ${contato.interesse || "não especificado"}

Sua tarefa: Reescreva a Mensagem Matriz gerando UMA NOVA variação, mantendo estritamente:
- A intenção central / oferta (NÃO INVENTE fatos ou preços).
- O tom amigável e direto (português BR).
- O tamanho similar.
- Você DEVE aplicar o nome do contato e o contexto na mensagem, se houver variáveis como {{nome}}, substitua pelo nome verdadeiro "${contato.nome}". 
- Seja ligeiramente diferente nas palavras iniciais/finais ou ordem, para não ser 100% igual.
- Retorne APENAS um JSON no formato:
{
  "variacao": "conteúdo da mensagem aqui"
}`;

      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: model || process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
        temperature: 0.4, // Less creative to not distort facts
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error("Empty response");

      const jsonResponse = JSON.parse(responseText);
      if (!jsonResponse.variacao) throw new Error("Invalid format returned");

      res.json(jsonResponse);
    } catch (e: any) {
      console.error("/api/generate-variation error:", e);
      res
        .status(500)
        .json({ error: e.message || "Error generating variation" });
    }
  });

  // ── Generate N template variations in a single GPT call (for campaign dispatch)
  app.post("/api/generate-campaign-variations", async (req, res): Promise<any> => {
    try {
      const openai = initOpenAI();
      if (!openai) {
        return res.status(500).json({ error: "OPENROUTER_API_KEY is required." });
      }

      const { template, count = 5 } = req.body as { template: string; count?: number };
      if (!template?.trim()) {
        return res.status(400).json({ error: "template is required." });
      }

      const n = Math.min(Math.max(Number(count) || 5, 2), 20);

      const prompt = `Você é um especialista em marketing de WhatsApp brasileiro.

Mensagem original:
"""
${template}
"""

Gere EXATAMENTE ${n} variações diferentes desta mensagem para uma campanha de WhatsApp.
Cada variação deve:
- Manter a mesma intenção/oferta (não invente fatos ou preços)
- Ter tom amigável e direto em português BR
- Ser ligeiramente diferente nas palavras iniciais, finais ou na estrutura
- Ter tamanho similar à original
- Manter EXATAMENTE os placeholders {{nome}} e {{produto}} onde existirem (não substitua)
- Não usar markdown, apenas texto puro
- Ser natural como uma mensagem humana enviada pelo WhatsApp

Retorne SOMENTE um JSON válido neste formato:
{
  "variations": [
    "variação 1 aqui",
    "variação 2 aqui"
  ]
}`;

      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
        temperature: 0.8,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("Empty GPT response");

      const parsed = JSON.parse(raw);
      const variations: string[] = Array.isArray(parsed.variations) ? parsed.variations : [];

      if (variations.length === 0) {
        throw new Error("GPT returned no variations");
      }

      console.log(`[CAMPAIGN VARIATIONS] Generated ${variations.length} variations`);
      return res.json({ variations });

    } catch (e: any) {
      console.error("/api/generate-campaign-variations error:", e);
      return res.status(500).json({ error: e.message || "Error generating variations" });
    }
  });

  app.post("/api/generate", async (req, res): Promise<any> => {
    try {
      // Rate limiting check
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      const now = Date.now();
      const userStatus = requestCounts.get(ip);

      if (userStatus) {
        if (now > userStatus.resetAt) {
          requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
        } else if (userStatus.count >= 20) {
          return res
            .status(429)
            .json({
              error: "Muitas requisições. Tente novamente em um minuto.",
            });
        } else {
          userStatus.count++;
        }
      } else {
        requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
      }

      const openai = initOpenAI();
      if (!openai) {
        return res.status(500).json({
          error:
            "OPENROUTER_API_KEY environment variable is required to generate messages.",
        });
      }

      const parsed = GenerateRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }

      const { tipo, contato, contexto } = parsed.data;

      const prompt = `Você é um assistente de vendas e marketing brasileiro, escrevendo mensagens persuasivas, naturais e curtas para WhatsApp.
Tom: amigável, português BR (sem formalidades excessivas, puxe assunto), use poucos emojis (1 a 2).
Evite soar como spam.
Tipo de mensagem: ${tipo}
Nome do contato: ${contato.nome || "Amigo(a)"}
Produto de interesse: ${contato.produto || "não especificado"}
Assunto principal: ${contato.interesse || "não especificado"}
Contexto adicional: ${contexto || "Nenhum"}

Crie 3 variações curtas de mensagens.
Retorne APENAS um JSON válido no seguinte formato:
{
  "variacoes": ["mensagem 1...", "mensagem 2...", "mensagem 3..."]
}`;

      const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: process.env.OPENAI_MODEL || "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error("Empty response from OpenAI");
      }

      let jsonResponse;
      try {
        jsonResponse = JSON.parse(responseText);
      } catch (e) {
        throw new Error("Failed to parse JSON response from OpenAI");
      }

      if (!jsonResponse.variacoes || !Array.isArray(jsonResponse.variacoes)) {
        throw new Error("Invalid format returned by OpenAI");
      }

      res.json(jsonResponse);
    } catch (e: any) {
      console.error("/api/generate error:", e);
      res
        .status(500)
        .json({
          error: e.message || "Internal server error while generating messages",
        });
    }
  });

  app.post("/api/analyze-lead", async (req, res): Promise<any> => {
    try {
      const { contactId } = req.body;
      if (!contactId) return res.status(400).json({ error: "Missing contactId" });

      const { serverDb } = await import("./src/server/firebase.ts");
      const { collection, getDocs, query, orderBy, limit, doc, setDoc, where } = await import("firebase/firestore");
      const { generateAIResponse } = await import("./src/server/aiProviders.ts");

      // 1. Fetch chat history for this contact
      const chatsSnapshot = await getDocs(query(collection(serverDb, "chats"), where("contactId", "==", contactId)));
      
      let chatId = null;
      if (!chatsSnapshot.empty) {
        chatId = chatsSnapshot.docs[0].id;
      }

      if (!chatId) {
        return res.json({ status: "nao_analisado", temperature: 0, summary: "Cliente não possui mensagens no CRM." });
      }

      // Fetch messages
      const messagesRef = collection(serverDb, "chats", chatId, "messages");
      const messagesSnap = await getDocs(query(messagesRef, orderBy("timestamp", "asc"), limit(50)));
      
      const messages = messagesSnap.docs.map(d => d.data());
      
      if (messages.length === 0) {
        return res.json({ status: "nao_analisado", temperature: 0, summary: "Nenhuma mensagem encontrada." });
      }

      const conversationText = messages.map(m => `${m.fromMe ? 'VENDEDOR' : 'CLIENTE'}: ${m.text || ''}`).join('\n');

      const systemPrompt = `Você é um analista de CRM expert em vendas. Analise a conversa entre Vendedor e Cliente e retorne um JSON exato:
{
  "status": "fechou" | "achou_caro" | "contato_futuro" | "em_negociacao" | "frio",
  "temperature": numero de 0 a 100 (chance de vender para este cliente. 100 se fechou, 0 se recusou totalmente),
  "summary": "Resumo muito curto (1 frase) sobre a intenção do cliente e motivo principal."
}`;

      const prompt = `CONVERSA:\n${conversationText}\n\nRetorne apenas o JSON.`;

      const aiResult = await generateAIResponse(prompt, systemPrompt, 0.7);
      
      let parsed = { status: "nao_analisado", temperature: 0, summary: "Erro na análise" };
      try {
        parsed = JSON.parse(aiResult.response.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {
        console.error("Failed to parse AI response:", aiResult.response);
      }

      // Save insights to contact
      const contactRef = doc(serverDb, "contacts", contactId);
      await setDoc(contactRef, {
        aiInsights: {
          status: parsed.status,
          temperature: parsed.temperature,
          summary: parsed.summary,
          lastAnalyzed: Date.now()
        }
      }, { merge: true });

      return res.json(parsed);

    } catch (err: any) {
      console.error("[analyze-lead] Error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Use express 4.x compatible fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Start Campaign Realtime Engine Worker
  try {
    const { initCampaignWorker } = await import("./src/server/campaignWorker.ts");
    initCampaignWorker();
  } catch (err) {
    console.error("Failed to start Campaign Worker:", err);
  }
}

startServer();