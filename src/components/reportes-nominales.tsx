import { NOMBRE_PRESTADOR, type PrestadorRed } from '@/lib/dnt/asignacion';
import type { GrupoPrimerNivel } from '@/lib/dnt/reporte-nominal';

/** Descarga del formato de reporte nominal (Word) por IPS de primer nivel, ya diligenciado con sus niños. */
export function ReportesNominales({ grupos, mostrarRuta }: { grupos: GrupoPrimerNivel[]; mostrarRuta: boolean }) {
  const total = grupos.reduce((s, g) => s + g.ninos, 0);
  return (
    <section className="tarjeta overflow-x-auto">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-semibold">Reporte nominal a las IPS de primer nivel</h2>
        <p className="max-w-3xl text-sm text-slate-500">
          Formato de reporte nominal de menores de cinco años con alteraciones nutricionales, generado automáticamente para cada IPS de primer nivel
          dueña de los niños ({grupos.length} IPS · {total} niños activos). Las secciones 1 y 2 salen diligenciadas; la IPS de primer nivel diligencia
          la gestión, las atenciones, el consolidado y las firmas, y lo devuelve. Envíelo por el mecanismo seguro definido por la EPSI: contiene datos de salud de menores.
        </p>
      </div>
      {grupos.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">No hay niños activos para reportar.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-marca-50 text-left text-xs uppercase text-marca-900">
            <tr>
              {mostrarRuta && <th className="px-3 py-2">Prestador de seguimiento</th>}
              <th className="px-3 py-2">IPS de primer nivel</th>
              <th className="px-3 py-2 text-right">Niños</th>
              <th className="px-3 py-2 text-right">DNT severa</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grupos.map(g => (
              <tr key={`${g.ruta}|${g.primaria}`} className="hover:bg-slate-50">
                {mostrarRuta && <td className="px-3 py-2 text-xs">{NOMBRE_PRESTADOR[g.ruta as PrestadorRed] ?? g.ruta}</td>}
                <td className="px-3 py-2 font-medium">{g.primaria}</td>
                <td className="px-3 py-2 text-right">{g.ninos}</td>
                <td className={`px-3 py-2 text-right ${g.severos ? 'font-semibold text-red-600' : ''}`}>{g.severos}</td>
                <td className="px-3 py-2 text-right">
                  <a className="boton-sec whitespace-nowrap px-2 py-1 text-xs" download
                    href={`/api/reporte-nominal?${new URLSearchParams({ primaria: g.primaria, ruta: g.ruta })}`}>
                    Descargar formato (Word)
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
