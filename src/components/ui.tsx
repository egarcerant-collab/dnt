import { ORDEN_SEMAFORO, SEMAFORO, semaforoDe, type ClaveSemaforo } from '@/lib/dnt/semaforo';
import { ALERTAS, type Estado, type Severidad, type TipoAlerta } from '@/lib/dnt/types';

/** Estado actual con el color de la semaforización oficial. `z` = último puntaje Z (distingue recuperado en riesgo). */
export function EstadoBadge({ estado, z }: { estado: Estado | string; z?: number | null }) {
  const s = semaforoDe(estado, z);
  return (
    <span
      title={`${estado} · ${s.descripcion}`}
      style={{ backgroundColor: s.color, color: s.texto }}
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
    >
      {s.etiqueta}
    </span>
  );
}

/** Leyenda de la semaforización, con conteo opcional por estado. */
export function LeyendaSemaforo({ conteo, compacta }: { conteo?: Partial<Record<ClaveSemaforo, number>>; compacta?: boolean }) {
  return (
    <ul className={compacta ? 'flex flex-wrap gap-2' : 'grid gap-2 sm:grid-cols-2'}>
      {ORDEN_SEMAFORO.map(k => {
        const s = SEMAFORO[k];
        return (
          <li key={k} className="flex items-start gap-2 text-xs" title={s.descripcion}>
            <span className="mt-0.5 h-4 w-6 shrink-0 rounded border border-black/10" style={{ backgroundColor: s.color }} />
            <span>
              <b className="text-slate-800">{s.etiqueta}</b>
              {conteo && <span className="ml-1 font-semibold text-slate-500">({conteo[k] ?? 0})</span>}
              {!compacta && <span className="block text-slate-500">{s.descripcion}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function SeveridadBadge({ severidad }: { severidad: Severidad }) {
  const c = severidad === 'SEVERA' ? 'bg-red-600 text-white' : severidad === 'MODERADA' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${c}`}>{severidad}</span>;
}

const COLOR_NIVEL = { alta: 'bg-red-50 text-red-700 ring-red-200', media: 'bg-amber-50 text-amber-700 ring-amber-200', baja: 'bg-slate-50 text-slate-600 ring-slate-200' };

export function AlertaChip({ tipo }: { tipo: TipoAlerta }) {
  const a = ALERTAS[tipo];
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${COLOR_NIVEL[a.nivel]}`}>{a.titulo}</span>;
}

export function formatoFecha(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function enmascararDocumento(doc: string): string {
  return doc.length > 4 ? `${'•'.repeat(doc.length - 4)}${doc.slice(-4)}` : doc;
}
