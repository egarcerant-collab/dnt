'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { accionRegistrarse, iniciarSesion, iniciarSesionPrestador } from '@/app/acciones';

type Pestana = 'epsi' | 'registro' | 'prestador';

const ERRORES: Record<string, string> = {
  credenciales: 'Usuario o contraseña incorrectos.',
  bloqueado: 'Demasiados intentos fallidos. Espera 5 minutos.',
  inactivo: 'Este acceso está desactivado. Contacta al administrador.',
  pendiente: 'Tu solicitud de registro aún no ha sido aprobada por el administrador.',
  'sin-nit': 'Tu IPS aún no tiene NIT registrado. Solicita a la EPSI que lo registre.',
  'usar-pestana-prestador': 'Los prestadores ingresan por la pestaña "Prestadores".',
};

function Boton({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return <button className="boton py-2.5" disabled={pending}>{pending ? 'Verificando…' : texto}</button>;
}

function CampoPassword({ etiqueta, nombre = 'password', ayuda, nueva }: { etiqueta: string; nombre?: string; ayuda?: string; nueva?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {etiqueta}
      <div className="relative">
        <input name={nombre} type={ver ? 'text' : 'password'} required minLength={nueva ? 8 : undefined}
          autoComplete={nueva ? 'new-password' : 'current-password'} className="input pr-16" placeholder="••••••••" />
        <button type="button" onClick={() => setVer(v => !v)} className="absolute inset-y-0 right-2 text-xs font-medium text-marca-700">
          {ver ? 'Ocultar' : 'Ver'}
        </button>
      </div>
      {ayuda && <span className="text-xs font-normal text-slate-500">{ayuda}</span>}
    </label>
  );
}

function Error({ error }: { error?: string }) {
  return error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORES[error] ?? 'No fue posible ingresar.'}</p> : null;
}

function FormRegistro() {
  const [estado, accion, pendiente] = useActionState(accionRegistrarse, null);
  if (estado?.ok) {
    return (
      <div className="flex flex-col gap-3 px-8 py-6">
        <p className="rounded-lg bg-marca-50 px-3 py-3 text-sm text-marca-900">{estado.mensaje}</p>
      </div>
    );
  }
  return (
    <form action={accion} className="flex flex-col gap-4 px-8 py-6">
      <p className="text-sm text-slate-500">Para funcionarios de Dusakawi EPSI. Tu cuenta quedará activa cuando el administrador apruebe la solicitud.</p>
      {estado && !estado.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.mensaje}</p>}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre completo
        <input name="nombre" required minLength={5} maxLength={100} autoComplete="name" className="input" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Correo institucional
        <input name="correo" type="email" required pattern="[A-Za-z0-9._\-]+@dusakawiepsi\.com" autoComplete="email" className="input" placeholder="usuario@dusakawiepsi.com" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Cargo / área
        <input name="cargo" maxLength={100} className="input" placeholder="Ej: Auditor · Gestión del Riesgo" />
      </label>
      <CampoPassword etiqueta="Contraseña" nueva ayuda="Mínimo 8 caracteres." />
      <CampoPassword etiqueta="Confirmar contraseña" nombre="confirmar" nueva />
      <button className="boton py-2.5" disabled={pendiente}>{pendiente ? 'Enviando…' : 'Solicitar registro'}</button>
    </form>
  );
}

export function FormIngreso({ prestadores, error, pestanaInicial }: { prestadores: string[]; error?: string; pestanaInicial?: Pestana }) {
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

      <div className="grid grid-cols-3 border-b border-slate-200 text-sm" role="tablist">
        {(
          [
            ['epsi', 'Iniciar sesión'],
            ['registro', 'Registrarse'],
            ['prestador', 'Prestadores'],
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

      {pestana === 'epsi' && (
        <form key="epsi" action={iniciarSesion} className="flex flex-col gap-4 px-8 py-6">
          <Error error={pestanaInicial === 'epsi' ? error : undefined} />
          <p className="text-sm text-slate-500">Funcionarios EPSI: indicadores, cumplimiento por prestador y municipio, alertas y calidad del dato.</p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Usuario
            <input name="usuario" required autoComplete="username" autoCapitalize="none" className="input" placeholder="usuario o correo @dusakawiepsi.com" />
          </label>
          <CampoPassword etiqueta="Contraseña" />
          <Boton texto="Ingresar al sistema" />
        </form>
      )}

      {pestana === 'registro' && <FormRegistro />}

      {pestana === 'prestador' && (
        <form key="prestador" action={iniciarSesionPrestador} className="flex flex-col gap-4 px-8 py-6">
          <Error error={pestanaInicial === 'prestador' ? error : undefined} />
          <p className="text-sm text-slate-500">Diligencia los controles de seguimiento de tus niños, responde notificaciones y carga historias clínicas.</p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Prestador (IPS)
            <select name="ips" required defaultValue="" className="input">
              <option value="" disabled>Selecciona tu IPS…</option>
              {prestadores.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <CampoPassword etiqueta="Contraseña" ayuda="La contraseña es el NIT de la IPS (con o sin dígito de verificación)." />
          <Boton texto="Ingresar como prestador" />
        </form>
      )}

      <p className="border-t border-marca-100 bg-marca-50 py-3 text-center text-xs text-slate-600">
        Acceso restringido · Solo personal autorizado
      </p>
    </div>
  );
}
