import { lms, pesoParaZ, sexoOms, tablaOms, type Tabla } from '@/lib/dnt/oms';

export interface PuntoOms { etiqueta: string; fecha: string | null; edadMeses: number | null; peso: number | null; talla: number | null; z: number | null }

// Curvas de la gráfica oficial: ±3 y ±2 en rojo (±2 punteadas), ±1 en naranja y la mediana en verde
const CURVAS: { z: number; color: string; punteada?: boolean }[] = [
  { z: 3, color: '#dc2626' }, { z: 2, color: '#dc2626', punteada: true }, { z: 1, color: '#d97706' }, { z: 0, color: '#15803d' },
  { z: -1, color: '#d97706' }, { z: -2, color: '#dc2626', punteada: true }, { z: -3, color: '#dc2626' },
];

const W = 640, H = 380, M = { l: 44, r: 30, t: 14, b: 40 };

function Grafica({ tabla, puntos, nina }: { tabla: Tabla; puntos: PuntoOms[]; nina: boolean }) {
  const pesos = CURVAS.flatMap(c => [tabla.min, tabla.max].map(x => pesoParaZ(lms(tabla.filas, x)!, c.z)));
  const yMin = Math.max(0, Math.floor(Math.min(...pesos, ...puntos.map(p => p.peso!)) - 1));
  const yMax = Math.ceil(Math.max(...pesos, ...puntos.map(p => p.peso!)) + 1);
  const px = (x: number) => M.l + ((x - tabla.min) / (tabla.max - tabla.min)) * (W - M.l - M.r);
  const py = (y: number) => H - M.b - ((y - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const xs = tabla.filas.map(f => f[0]);
  const marcoX = Array.from({ length: Math.floor((tabla.max - tabla.min) / 5) + 1 }, (_, i) => tabla.min + i * 5);
  const marcoY = Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i);
  const fondo = nina ? '#f9a8d4' : '#38bdf8';

  return (
    <div className="rounded-lg p-2" style={{ background: fondo }}>
      <p className="px-1 pb-1 text-sm font-bold text-white drop-shadow">{tabla.titulo} · Puntuación Z</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded bg-white" role="img" aria-label={tabla.titulo}>
        {marcoX.map(x => <line key={`x${x}`} x1={px(x)} x2={px(x)} y1={M.t} y2={H - M.b} stroke="#e5e7eb" strokeWidth={x % 10 === 0 ? 1 : 0.5} />)}
        {marcoY.map(y => <line key={`y${y}`} x1={M.l} x2={W - M.r} y1={py(y)} y2={py(y)} stroke="#e5e7eb" strokeWidth={y % 5 === 0 ? 1 : 0.5} />)}
        {marcoX.filter(x => x % 10 === 0 || x === tabla.min).map(x => <text key={`tx${x}`} x={px(x)} y={H - M.b + 14} fontSize={10} textAnchor="middle" fill="#334155">{x}</text>)}
        {marcoY.filter(y => (yMax - yMin > 20 ? y % 2 === 0 : true)).map(y => <text key={`ty${y}`} x={M.l - 6} y={py(y) + 3} fontSize={10} textAnchor="end" fill="#334155">{y}</text>)}
        <text x={(M.l + W - M.r) / 2} y={H - 6} fontSize={11} textAnchor="middle" fill="#0f172a" fontWeight={600}>{tabla.tipo === 'longitud' ? 'Longitud (cm)' : 'Talla (cm)'}</text>
        <text x={12} y={(M.t + H - M.b) / 2} fontSize={11} textAnchor="middle" fill="#0f172a" fontWeight={600} transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>Peso (kg)</text>
        {CURVAS.map(c => (
          <g key={c.z}>
            <polyline fill="none" stroke={c.color} strokeWidth={1.6} strokeDasharray={c.punteada ? '6 4' : undefined}
              points={xs.map(x => `${px(x).toFixed(1)},${py(pesoParaZ(lms(tabla.filas, x)!, c.z)).toFixed(1)}`).join(' ')} />
            <text x={W - M.r + 4} y={py(pesoParaZ(lms(tabla.filas, tabla.max)!, c.z)) + 3} fontSize={10} fill={c.color} fontWeight={600}>{c.z > 0 ? `+${c.z}` : c.z}</text>
          </g>
        ))}
        {puntos.length > 1 && <polyline fill="none" stroke="#0f172a" strokeWidth={1.4} points={puntos.map(p => `${px(p.talla!)},${py(p.peso!)}`).join(' ')} />}
        {puntos.map((p, i) => (
          <g key={i}>
            <circle cx={px(p.talla!)} cy={py(p.peso!)} r={4.5} fill="#0f172a" stroke="#fff" strokeWidth={1.5}>
              <title>{`${p.etiqueta}: ${p.peso} kg · ${p.talla} cm · Z ${p.z ?? '—'}`}</title>
            </circle>
            <text x={px(p.talla!) + 6} y={py(p.peso!) - 6} fontSize={9} fill="#0f172a" stroke="#fff" strokeWidth={2.5} paintOrder="stroke">{p.etiqueta}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Gráficas de peso para la longitud (0–2 años) y peso para la talla (2–5 años) de la OMS con las mediciones del niño. */
export function GraficaOms({ sexo, puntos }: { sexo: string; puntos: PuntoOms[] }) {
  const s = sexoOms(sexo);
  const validos = puntos.filter(p => p.peso && p.talla && p.edadMeses != null && p.edadMeses < 60);
  if (!s) return <p className="text-sm text-slate-500">Sin sexo registrado: no se puede elegir la tabla de la OMS.</p>;
  if (!validos.length) return <p className="text-sm text-slate-500">Aún no hay mediciones de peso y talla con fecha para graficar.</p>;
  const grupos = [
    { tabla: tablaOms(s, 0), puntos: validos.filter(p => p.edadMeses! < 24) },
    { tabla: tablaOms(s, 24), puntos: validos.filter(p => p.edadMeses! >= 24) },
  ].filter(g => g.puntos.length);
  return (
    <div className={`grid gap-4 ${grupos.length > 1 ? 'xl:grid-cols-2' : ''}`}>
      {grupos.map(g => {
        const fuera = g.puntos.filter(p => p.talla! < g.tabla.min || p.talla! > g.tabla.max);
        return (
          <div key={g.tabla.tipo}>
            <Grafica tabla={g.tabla} puntos={g.puntos.filter(p => !fuera.includes(p))} nina={s === 'F'} />
            {fuera.length > 0 && <p className="mt-1 text-xs text-amber-700">{fuera.length} medición(es) fuera del rango de la tabla ({g.tabla.min}–{g.tabla.max} cm).</p>}
          </div>
        );
      })}
    </div>
  );
}
