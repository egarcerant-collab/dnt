/** Pie de página con créditos y botón de soporte por WhatsApp (abre el chat con el mensaje ya escrito). */
const WHATSAPP_SOPORTE = '573014343544';
const MENSAJE = 'Hola, tengo una pregunta sobre Nutria (Monitoreo de Desnutrición · Dusakawi EPSI):';

export function PieSoporte() {
  const enlace = `https://wa.me/${WHATSAPP_SOPORTE}?text=${encodeURIComponent(MENSAJE)}`;
  return (
    <footer className="mt-8 flex flex-col items-center gap-2 px-4 pb-8 pt-4 text-center text-xs text-slate-500">
      <a href={enlace} target="_blank" rel="noopener"
        className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-90">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7c.1.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.4-.3z" />
        </svg>
        Escribir a soporte por WhatsApp
      </a>
      <p className="mt-2 font-semibold text-slate-600">Creado y soportado por Eduardo Luis Garcerant González</p>
      <p>Auditor · Dirección Nacional de Gestión del Riesgo en Salud · Dusakawi EPSI</p>
      <p className="text-slate-400">Odontólogo General · Esp. Sistemas de Calidad y Auditoría en Salud · Mg. Epidemiología</p>
      <p className="mt-1 text-slate-400">Información con reserva legal (Ley 1581/2012 · Res. 1995/1999).</p>
    </footer>
  );
}
