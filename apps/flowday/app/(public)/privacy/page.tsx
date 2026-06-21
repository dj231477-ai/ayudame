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
        <a href={en ? '/privacy' : '/privacy?lang=en'} className="text-neutral-500 underline">
          {en ? 'Español' : 'English'}
        </a>
      </div>

      {en ? (
        <>
          <p>We collect the minimum data needed to run FlowDay: your email and name (identity), evidence photos, schedule/habit history, push subscription and credit usage.</p>
          <p><strong>AI use:</strong> evidence photos are sent to AI providers (Gemini, and MiniMax M3 when the paid fallback is active) solely to verify them, via short-lived signed URLs, and are not used to train models.</p>
          <p><strong>Retention by plan:</strong> Free 7 days of photos, Pro 365 days, Team 730 days. Logs and history follow the same policy.</p>
          <p><strong>We do NOT collect:</strong> GPS location, Google task content (only IDs), health data, or telemetry from other apps.</p>
          <p><strong>Account deletion:</strong> you can delete your account at any time; we remove your data (cascade), storage photos and sessions.</p>
        </>
      ) : (
        <>
          <p>Recopilamos el mínimo necesario para operar FlowDay: tu email y nombre (identidad), fotos de evidencia, historial de horario/hábitos, suscripción push y consumo de créditos.</p>
          <p><strong>Uso de IA:</strong> las fotos de evidencia se envían a proveedores de IA (Gemini, y MiniMax M3 cuando el fallback de pago está activo) solo para verificarlas, vía URLs firmadas efímeras, y no se usan para entrenar modelos.</p>
          <p><strong>Retención por plan:</strong> Free 7 días de fotos, Pro 365 días, Team 730 días. Logs e historial siguen la misma política.</p>
          <p><strong>NO recopilamos:</strong> ubicación GPS, contenido de tareas de Google (solo IDs), datos de salud ni telemetría de otras apps.</p>
          <p><strong>Borrado de cuenta:</strong> puedes borrar tu cuenta cuando quieras; eliminamos tus datos (cascade), las fotos de Storage y las sesiones.</p>
        </>
      )}
    </main>
  );
}
