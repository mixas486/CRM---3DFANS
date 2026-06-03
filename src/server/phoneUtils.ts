// Único utilitário de telefone/identidade do backend.
// A extração de sender/remoteJid/phoneE164 é feita SOMENTE por
// extractWhatsAppIdentity() (src/utils/whatsappIdentity.ts).
// Aqui mora apenas a validação canônica de E.164 BR.
//
// A antiga função extractSender() foi removida: era um parser concorrente
// sem nenhum import no projeto e derivava telefone do remoteJid, o que
// causava o vazamento de números @lid como @s.whatsapp.net.

export function isValidE164BR(phone: string): boolean {
  return (
    phone.startsWith("55") &&
    phone.length >= 12 &&
    phone.length <= 13
  );
}