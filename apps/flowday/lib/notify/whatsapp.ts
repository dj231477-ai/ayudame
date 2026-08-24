import 'server-only';
import { sendWhatsAppText } from '@flowday/core/notifications/whatsapp';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Envía un texto libre por WhatsApp al usuario si tiene el número vinculado (§C-13.10, D-10).
 * Solo llega si el usuario abrió la ventana de 24h él mismo (p. ej. con "comenzar" hoy); fuera
 * de esa ventana Meta rechaza el envío y sendWhatsAppText degrada en silencio — nunca se
 * intenta una plantilla ni se genera costo nuevo (D-8/D-10 siguen vigentes).
 */
export async function notifyWhatsAppIfLinked(userId: string, body: string): Promise<void> {
  const svc = createServiceClient();
  const { data: link } = await svc
    .from('whatsapp_links')
    .select('phone_e164')
    .eq('user_id', userId)
    .maybeSingle();
  if (link?.phone_e164) {
    await sendWhatsAppText(link.phone_e164, body);
  }
}
