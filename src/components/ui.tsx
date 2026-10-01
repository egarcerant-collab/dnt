import { ALERTAS, type Estado, type Severidad, type TipoAlerta } from '@/lib/dnt/types';

const COLOR_ESTADO: Record<Estado, string> = {
  RECUPERADO: 'bg-marca-100 text-marca-800',
  'EN PROCESO DE RECUPERACION': 'bg-sky-100 text-sky-800',
  RECAIDA: 'bg-orange-100 text-orange-800',
  FALLECIDO: 'bg-slate-800 text-white',
  DESCARTADO: 'bg-slate-100 text-slate-600',
  DESERTADO: 'bg-rose-100 text-rose-800',
  'BUSQUEDA FALLIDA': 'bg-rose-100 text-rose-800',
  'SIN DILIGENCIAR': 'bg-amber-100 text-amber-800',
};

export function EstadoBadge({ estado }: { estado: Estado }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[estado]}`}>{estado}</span>;
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
