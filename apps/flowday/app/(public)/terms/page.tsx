// Términos de servicio (ES/EN). SPEC §C-15.5, §C-9.6.
export const dynamic = 'force-dynamic';

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const en = lang === 'en';

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{en ? 'Terms of Service' : 'Términos de servicio'}</h1>
        <a href={en ? '/terms' : '/terms?lang=en'} className="text-neutral-500 underline">
          {en ? 'Español' : 'English'}
        </a>
      </div>

      {en ? (
        <>
          <p><strong>Acceptable use:</strong> FlowDay is a personal productivity tool. Do not upload illegal content or attempt to deceive the verification system.</p>
          <p><strong>Credits:</strong> credits are non-refundable except for system failures (e.g., our outage). Content rejections are charged; you may retry with another photo.</p>
          <p><strong>Liability:</strong> the service is provided "as is"; we are not liable for indirect damages. AI verification is best-effort and may err.</p>
        </>
      ) : (
        <>
          <p><strong>Uso aceptable:</strong> FlowDay es una herramienta de productividad personal. No subas contenido ilegal ni intentes engañar al sistema de verificación.</p>
          <p><strong>Créditos:</strong> los créditos no son reembolsables salvo fallo del sistema (p. ej., una caída nuestra). Los rechazos por contenido sí se cobran; puedes reintentar con otra foto.</p>
          <p><strong>Responsabilidad:</strong> el servicio se ofrece "tal cual"; no respondemos por daños indirectos. La verificación por IA es best-effort y puede equivocarse.</p>
        </>
      )}
    </main>
  );
}
