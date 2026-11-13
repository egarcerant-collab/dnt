import type { Caso } from '@/lib/dnt/types';
import { sexoDe } from '@/lib/dnt/filtros';

/** Bandas de edad de la pirámide (de mayor a menor, como se dibuja de arriba hacia abajo). */
export const BANDAS_PIRAMIDE = ['≥ 60 meses', '48–59 meses', '36–47 meses', '24–35 meses', '12–23 meses', '6–11 meses', '0–5 meses'] as const;

export function bandaPiramide(m: number | null): string | null {
  if (m == null || m < 0) return null;
  return m < 6 ? '0–5 meses' : m < 12 ? '6–11 meses' : m < 24 ? '12–23 meses' : m < 36 ? '24–35 meses' : m < 48 ? '36–47 meses' : m < 60 ? '48–59 meses' : '≥ 60 meses';
}

type Celda = { severa: number; moderada: number; otra: number };
const vacia = (): Celda => ({ severa: 0, moderada: 0, otra: 0 });
const total = (c: Celda) => c.severa + c.moderada + c.otra;

const COLOR = {
  Masculino: { severa: '#1e40af', moderada: '#60a5fa', otra: '#cbd5e1' },
  Femenino: { severa: '#9d174d', moderada: '#f472b6', otra: '#cbd5e1' },
};

/** Pirámide poblacional de los casos de DNT: edad (meses) × sexo, con el tipo de DNT (severa / moderada) apilado. */
export function PiramideDnt({ casos }: { casos: Caso[] }) {
  const datos = Object.fromEntries(BANDAS_PIRAMIDE.map(b => [b, { Masculino: vacia(), Femenino: vacia() }])) as Record<string, Record<'Masculino' | 'Femenino', Celda>>;
  let sinEdad = 0, sinSexo = 0;
  for (const c of casos) {
    const b = bandaPiramide(c.edadMeses);
    const s = sexoDe(c);
    if (!b) { sinEdad++; continue; }
    if (s === 'Sin dato') { sinSexo++; continue; }
    const k = c.severidad === 'SEVERA' ? 'severa' : c.severidad === 'MODERADA' ? 'moderada' : 'otra';
    datos[b][s as 'Masculino' | 'Femenino'][k]++;
  }
  const bandas = BANDAS_PIRAMIDE.filter(b => b !== '≥ 60 meses' || total(datos[b].Masculino) + total(datos[b].Femenino) > 0);
  const totM = bandas.reduce((t, b) => t + total(datos[b].Masculino), 0);
  const totF = bandas.reduce((t, b) => t + total(datos[b].Femenino), 0);
  const graficados = totM + totF;
  const max = Math.max(1, ...bandas.flatMap(b => [total(datos[b].Masculino), total(datos[b].Femenino)]));
  const pct = (n: number) => (graficados ? Math.round((n / graficados) * 1000) / 10 : 0);

  const Barra = ({ c, lado }: { c: Celda; lado: 'Masculino' | 'Femenino' }) => {
    const n = total(c);
    const col = COLOR[lado];
    const segs = (['severa', 'moderada', 'otra'] as const).filter(k => c[k]);
    return (
      <div className={`flex items-center gap-1.5 ${lado === 'Masculino' ? 'flex-row-reverse' : ''}`}>
        <div className={`flex h-7 overflow-hidden ${lado === 'Masculino' ? 'flex-row-reverse rounded-l' : 'rounded-r'}`} style={{ width: `${(n / max) * 100}%` }}
          title={`${lado}: ${n} (${c.severa} severa · ${c.moderada} moderada${c.otra ? ` · ${c.otra} sin clasificar` : ''})`}>
          {segs.map(k => <span key={k} style={{ width: `${(c[k] / n) * 100}%`, background: col[k] }} />)}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-slate-600">{n || ''}</span>
      </div>
    );
  };

  return (
    <section className="tarjeta flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Pirámide poblacional de la desnutrición</h3>
        <span className="text-xs text-slate-500">{graficados} niños graficados</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 text-xs font-semibold">
        <span className="text-right text-blue-800">Niños {totM} ({pct(totM)}%)</span>
        <span className="w-24 text-center text-slate-400">Edad</span>
        <span className="text-pink-800">Niñas {totF} ({pct(totF)}%)</span>
      </div>
      <div className="flex flex-1 flex-col justify-around gap-1.5">
        {bandas.map(b => (
          <div key={b} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
            <Barra c={datos[b].Masculino} lado="Masculino" />
            <span className="w-24 text-center text-xs text-slate-700">{b}</span>
            <Barra c={datos[b].Femenino} lado="Femenino" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.Masculino.severa }} /><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.Femenino.severa }} /> DNT severa</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.Masculino.moderada }} /><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.Femenino.moderada }} /> DNT moderada</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.Masculino.otra }} /> Sin clasificar</span>
      </div>
      {(sinEdad > 0 || sinSexo > 0) && (
        <p className="text-[11px] text-slate-500">No graficados: {sinEdad ? `${sinEdad} sin edad` : ''}{sinEdad && sinSexo ? ' · ' : ''}{sinSexo ? `${sinSexo} sin sexo registrado` : ''}.</p>
      )}
    </section>
  );
}
