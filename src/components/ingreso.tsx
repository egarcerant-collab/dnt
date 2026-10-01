'use client';

import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { iniciarSesion, iniciarSesionPrestador } from '@/app/acciones';

type Pestana = 'epsi' | 'prestador';
export interface OpcionPrestador { ips: string; nit: string }

const ERRORES: Record<string, string> = {
  credenciales: 'Usuario o contraseña incorrectos.',
  bloqueado: 'Demasiados intentos fallidos. Espera 5 minutos.',
  inactivo: 'Este acceso está desactivado. Contacta a la EPSI.',
  'sin-nit': 'Tu IPS aún no tiene NIT registrado. Solicita a la EPSI que lo registre.',
  'usar-pestana-prestador': 'Los prestadores ingresan por la pestaña "Prestadores (IPS)".',
};

function Boton({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return <button className="boton py-2.5" disabled={pending}>{pending ? 'Verificando…' : texto}</button>;
}

function CampoPassword({ etiqueta, ayuda }: { etiqueta: string; ayuda?: string }) {
  const [ver, setVer] = useState(false);
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {etiqueta}
      <div className="relative">
        <input name="password" type={ver ? 'text' : 'password'} required autoComplete="current-password" className="input pr-16" placeholder="••••••••" />
        <button type="button" onClick={() => setVer(v => !v)} className="absolute inset-y-0 right-2 text-xs font-medium text-marca-700">
          {ver ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      {ayuda && <span className="text-xs font-normal text-slate-500">{ayuda}</span>}
    </label>
  );
}

/** Buscador de prestador por nombre o NIT. */
function BuscadorPrestador({ prestadores }: { prestadores: OpcionPrestador[] }) {
  const [q, setQ] = useState('');
  const [elegido, setElegido] = useState<OpcionPrestador | null>(null);
  const resultados = useMemo(() => {
    const t = q.trim().toUpperCase();
    if (t.length < 2) return [];
    return prestadores.filter(p => p.ips.includes(t) || (p.nit && p.nit.includes(t.replace(/\D/g, '') || '#'))).slice(0, 8);
  }, [q, prestadores]);

  return (
    <div className="flex flex-col gap-1 text-sm font-medium">
      Prestador (IPS)
      <input type="hidden" name="ips" value={elegido?.ips ?? ''} />
      {elegido ? (
        <div className="flex items-center justify-between rounded-lg border border-marca-600 bg-marca-50 px-3 py-2">
          <span>
            <b className="block text-marca-900">{elegido.ips}</b>
            <span className="text-xs font-normal text-slate-600">NIT {elegido.nit || 'pendiente de registro'}</span>
          </span>
          <button type="button" className="text-xs text-marca-700 hover:underline" onClick={() => { setElegido(null); setQ(''); }}>Cambiar</button>
        </div>
      ) : (
        <div className="relative">
          <input value={q} onChange={e => setQ(e.target.value)} className="input" placeholder="Escribe el nombre o el NIT de tu IPS" autoComplete="off" />
          {resultados.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {resultados.map(p => (
                <li key={p.ips}>
                  <button type="button" onClick={() => setElegido(p)} className="w-full px-3 py-2 text-left hover:bg-marca-50">
                    <span className="block font-medium">{p.ips}</span>
                    <span className="text-xs text-slate-500">NIT {p.nit || 'pendiente'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && resultados.length === 0 && <p className="mt-1 text-xs font-normal text-slate-500">No se encontró ningún prestador.</p>}
        </div>
      )}
    </div>
  );
}

export function FormIngreso({ prestadores, error, pestanaInicial }: { prestadores: OpcionPrestador[]; error?: string; pestanaInicial?: Pestana }) {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial ?? 'epsi');

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-marca-600 bg-white shadow-lg">
      <div className="flex flex-col items-center gap-1 bg-marca-700 px-6 py-6 text-white">
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/10">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <h1 className="text-lg font-bold tracking-widest">INGRESO AL SISTEMA</h1>
        <p className="text-sm text-white/85">Monitoreo de Desnutrición Aguda en menores de 5 años</p>
      </div>

      <div className="grid grid-cols-2 border-b border-slate-200 text-sm" role="tablist">
        {(
          [
            ['epsi', 'Funcionarios EPSI'],
            ['prestador', 'Prestadores (IPS)'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={pestana === k}
            onClick={() => setPestana(k)}
            className={`py-3 font-medium ${pestana === k ? 'border-b-2 border-marca-600 bg-marca-50 text-marca-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {pestana === 'epsi' ? (
        <form key="epsi" action={iniciarSesion} className="flex flex-col gap-4 px-8 py-6">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORES[error] ?? 'No fue posible ingresar.'}</p>}
          <p className="text-sm text-slate-500">Indicadores, cumplimiento por prestador y municipio, alertas y calidad del dato.</p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Usuario
            <input name="usuario" required autoComplete="username" autoCapitalize="none" className="input" placeholder="usuario o correo @dusakawiepsi.com" />
          </label>
          <CampoPassword etiqueta="Contraseña" />
          <Boton texto="Ingresar al sistema" />
        </form>
      ) : (
        <form key="prestador" action={iniciarSesionPrestador} className="flex flex-col gap-4 px-8 py-6">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORES[error] ?? 'No fue posible ingresar.'}</p>}
          <p className="text-sm text-slate-500">Diligencia los controles de seguimiento de tus niños, responde notificaciones y carga historias clínicas.</p>
          <BuscadorPrestador prestadores={prestadores} />
          <CampoPassword etiqueta="Contraseña" ayuda="Primer ingreso: escribe el NIT de la IPS. Luego crearás tu contraseña personal." />
          <Boton texto="Ingresar como prestador" />
        </form>
      )}

      <p className="border-t border-marca-100 bg-marca-50 py-3 text-center text-xs text-slate-600">
        Acceso restringido · Solo personal autorizado
      </p>
    </div>
  );
}
