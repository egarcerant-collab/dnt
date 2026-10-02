import { redirect } from 'next/navigation';
import { Encabezado } from '@/components/encabezado';
import { PanelSeguimiento } from '@/components/panel-seguimiento';
import { listarHistorias } from '@/lib/dnt/historias';
import { listarMensajes } from '@/lib/dnt/mensajes';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { construirTraza } from '@/lib/dnt/traza';
import { resumenesPorIps, textoWhatsApp } from '@/lib/dnt/informe-ips';
import { listarPrestadores } from '@/lib/prestadores';
import { esEpsi, getSesion } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

/** Funcionarios EPSI: trazabilidad de lo que diligencian y cargan los prestadores. */
export default async function Seguimiento() {
  const sesion = await getSesion();
  if (!sesion) redirect('/');
  if (!esEpsi(sesion.rol)) redirect('/prestador');

  const [base, historias, mensajes] = await Promise.all([obtenerBase(), listarHistorias(undefined, { incluirAnuladas: true }), listarMensajes()]);
  const { filas, eventos } = construirTraza(base.casos, historias, mensajes);
  const [prestadores, resumenes] = await Promise.all([listarPrestadores(), resumenesPorIps()]);
  const contactos = Object.fromEntries(
    prestadores.map(p => [p.ips, { contacto: p.contacto && { responsable: p.contacto.responsable, correos: p.contacto.correos, whatsapp: p.contacto.whatsapp }, texto: resumenes.get(p.ips) ? textoWhatsApp(resumenes.get(p.ips)!) : '' }]),
  );

  return (
    <>
      <Encabezado sesion={sesion} fechaCorte={base.fechaCorte} almacenamiento={base.almacenamiento} />
      <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-marca-900">Seguimiento y trazabilidad de prestadores</h1>
          <p className="text-sm text-slate-600">Lo que cada IPS ha diligenciado, cargado y respondido, niño por niño.</p>
        </div>
        <PanelSeguimiento filas={filas} eventos={eventos.slice(0, 300)} contactos={contactos} />
      </main>
    </>
  );
}
