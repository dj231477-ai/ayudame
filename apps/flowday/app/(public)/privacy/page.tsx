// Política de privacidad (ES/EN). SPEC §C-15.5, §C-15.6.
export const dynamic = 'force-dynamic';

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const en = lang === 'en';

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{en ? 'Privacy Policy' : 'Política de privacidad'}</h1>
        <a href={en ? '/privacy' : '/privacy?lang=en'} className="text-neutral-600 underline">
          {en ? 'Español' : 'English'}
        </a>
      </div>

      {en ? (
        <>
          <p>We collect the minimum data needed to run FlowDay: your email and name (identity), evidence photos, schedule/habit history, push subscription and credit usage.</p>
          <p><strong>AI use:</strong> evidence photos are sent to AI providers (Gemini, and MiniMax M3 once the paid fallback is active, per §C-25 D-2) solely to verify them, via short-lived signed URLs. Groq and Cerebras (used for text features) never train on your data, and neither does MiniMax M3 under its commercial terms. Gemini&apos;s free tier — our default for photo verification, to keep the service free — may use submitted content to improve Google&apos;s products. Because of this, we ask you to avoid showing your face, other people, ID documents, or sensitive screens in your evidence photo: focus only on the task itself.</p>
          <p><strong>Retention by plan:</strong> Free 7 days of photos, Pro 365 days, Team 730 days. Logs and history follow the same policy.</p>
          <p><strong>We do NOT collect:</strong> GPS location, Google task content (only IDs), health data, or telemetry from other apps.</p>
          <p><strong>WhatsApp (optional):</strong> if you connect WhatsApp from Settings, we store your phone number to identify you and match incoming messages to your account. Messages you send us (evidence photos, commands) are processed through Meta&apos;s official WhatsApp Business Platform, subject to Meta&apos;s own privacy policy. We only read messages you send us — we never message you first outside of a reply to your own message.</p>
          <p><strong>Account deletion:</strong> go to <a href="/settings" className="underline">Settings</a> → &quot;Your data&quot; → &quot;Delete my account&quot; → confirm. This immediately and permanently removes your profile, block/habit history, evidence photos and active sessions; it cannot be undone. If you can&apos;t access your account, email <a href="mailto:ops@flowday.app" className="underline">ops@flowday.app</a> to request deletion manually.</p>
        </>
      ) : (
        <>
          <p>Recopilamos el mínimo necesario para operar FlowDay: tu email y nombre (identidad), fotos de evidencia, historial de horario/hábitos, suscripción push y consumo de créditos.</p>
          <p><strong>Uso de IA:</strong> las fotos de evidencia se envían a proveedores de IA (Gemini, y MiniMax M3 una vez esté activo el fallback de pago, §C-25 D-2) solo para verificarlas, vía URLs firmadas efímeras. Groq y Cerebras (usados en funciones de texto) nunca entrenan con tus datos, y tampoco lo hace MiniMax M3 bajo sus términos comerciales. El tier gratuito de Gemini —el que usamos por defecto para verificar fotos, para mantener el servicio gratis— sí puede usar el contenido enviado para mejorar sus productos. Por eso te pedimos evitar mostrar tu rostro, a otras personas, documentos de identidad o pantallas sensibles en la foto de evidencia: enfoca solo la tarea.</p>
          <p><strong>Retención por plan:</strong> Free 7 días de fotos, Pro 365 días, Team 730 días. Logs e historial siguen la misma política.</p>
          <p><strong>NO recopilamos:</strong> ubicación GPS, contenido de tareas de Google (solo IDs), datos de salud ni telemetría de otras apps.</p>
          <p><strong>WhatsApp (opcional):</strong> si conectas WhatsApp desde Ajustes, guardamos tu número para identificarte y asociar los mensajes que nos envías a tu cuenta. Los mensajes que nos escribes (fotos de evidencia, comandos) se procesan a través de la plataforma oficial de WhatsApp Business de Meta, sujeta a la política de privacidad propia de Meta. Solo leemos mensajes que tú nos escribes primero — nunca te escribimos nosotros primero fuera de responder a tu propio mensaje.</p>
          <p><strong>Borrado de cuenta:</strong> entra a <a href="/settings" className="underline">Ajustes</a> → &quot;Tus datos&quot; → &quot;Borrar mi cuenta&quot; → confirma. Esto elimina de inmediato y de forma permanente tu perfil, historial de bloques/hábitos, fotos de evidencia y sesiones activas; no se puede deshacer. Si no puedes acceder a tu cuenta, escribe a <a href="mailto:ops@flowday.app" className="underline">ops@flowday.app</a> para solicitar el borrado manualmente.</p>
        </>
      )}
    </main>
  );
}
