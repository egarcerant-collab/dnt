'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ESTADOS, MAX_CONTROLES, NOMBRE_CONTROL, type Estado } from '@/lib/dnt/types';
import { hoyColombia } from '@/lib/fecha';
import { ACEPTA_HC, MB, TAMANO_MAX_HC, subirHistoria } from './subir-historia';

/** Clasificación OMS peso/talla a partir del puntaje Z (Res. 2465/2016). */
function clasificarZ(z: number): string {
  if (z < -3) return 'DESNUTRICION AGUDA SEVERA';
  if (z < -2) return 'DESNUTRICION AGUDA MODERADA';
  if (z < -1) return 'RIESGO DE DESNUTRICION AGUDA';
  if (z <= 1) return 'PESO ADECUADO PARA LA TALLA';
  return 'RIESGO DE SOBREPESO';
}

const num = (v: FormDataEntryValue | null) => Number(String(v ?? '').replace(',', '.'));

async function enviar(casoId: string, cuerpo: object) {
  const res = await fetch(`/api/casos/${encodeURIComponent(casoId)}/controles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
  return data as { ok: boolean; numero?: number };
}

/** Columna AX: IPS / ESE de atención primaria. */
export function FormAtencionPrimaria({ casoId, valor }: { casoId: string; valor: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async e => {
        e.preventDefault();
        try {
          await enviar(casoId, { accion: 'atencion-primaria', valor: new FormData(e.currentTarget).get('valor') });
          setMsg({ ok: true, t: 'Guardado.' });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, t: (err as Error).message });
        }
      }}
    >
      <label className="flex min-w-72 flex-1 flex-col gap-1 text-sm">
        <span><b>AX</b> · Nombre IPS / ESE de atención primaria</span>
        <input name="valor" defaultValue={valor} required maxLength={150} className="input" />
      </label>
      <button className="boton-sec h-[38px]">Guardar</button>
      {msg && <span className={`text-sm ${msg.ok ? 'text-marca-700' : 'text-red-600'}`}>{msg.t}</span>}
    </form>
  );
}

/** Siguiente bloque de control (columnas AY..KF del libro de prestadores). */
export function FormControl({ casoId, profesional, ips, estadoActual, numeroSiguiente, conFechaFtlc }: {
  casoId: string;
  profesional: string;
  ips: string;
  estadoActual: Estado;
  numeroSiguiente: number;
  conFechaFtlc: boolean;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [z, setZ] = useState('');
  const [progreso, setProgreso] = useState<number | null>(null);
  const zNum = parseFloat(z.replace(',', '.'));
  const sugerida = Number.isFinite(zNum) ? clasificarZ(zNum) : '';
  const hoy = hoyColombia();

  if (numeroSiguiente > MAX_CONTROLES) {
    return <p className="tarjeta p-4 text-sm text-slate-600">Este niño ya tiene los {MAX_CONTROLES} controles que admite el libro.</p>;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    // Cada control debe llevar su historia clínica
    const hc = fd.get('historia');
    if (!(hc instanceof File) || hc.size === 0) return setMensaje({ ok: false, texto: 'Adjunta la historia clínica de este control.' });
    if (hc.size > TAMANO_MAX_HC) return setMensaje({ ok: false, texto: `La historia clínica supera ${TAMANO_MAX_HC / MB} MB.` });
    setEnviando(true);
    setMensaje(null);
    let numero: number | undefined;
    try {
      const r = await enviar(casoId, {
        fecha: fd.get('fecha'),
        peso: num(fd.get('peso')),
        talla: num(fd.get('talla')),
        zPesoTalla: zNum,
        clasificacion: fd.get('clasificacion') || sugerida,
        energia: fd.get('energia'),
        fechaEntregaFtlc: fd.get('fechaEntregaFtlc') || null,
        medicamento: fd.get('medicamento'),
        recomendaciones: fd.get('recomendaciones'),
        resultado: fd.get('resultado'),
        ips: fd.get('ips'),
        observaciones: fd.get('observaciones'),
        profesional: fd.get('profesional'),
        estado: fd.get('estado') || undefined,
      });
      numero = r.numero ?? numeroSiguiente;
      setProgreso(0);
      await subirHistoria(casoId, hc, numero, setProgreso);
      setMensaje({ ok: true, texto: `Control ${numero} guardado con su historia clínica.` });
      form.reset();
      setZ('');
      router.refresh();
    } catch (err) {
      const msg = (err as Error).message;
      setMensaje({
        ok: false,
        texto: numero
          ? `El control ${numero} se guardó, pero la historia clínica no se pudo subir (${msg}). Súbela en "Historia clínica" eligiendo el control ${numero}.`
          : msg,
      });
      if (numero) router.refresh();
    } finally {
      setEnviando(false);
      setProgreso(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="tarjeta flex flex-col gap-5 p-4">
      <div>
        <p className="etiqueta">Diligenciar · bloque {numeroSiguiente} de {MAX_CONTROLES}</p>
        <h2 className="text-lg font-semibold text-marca-900">{NOMBRE_CONTROL[numeroSiguiente - 1]}</h2>
        <p className="text-xs text-slate-500">Res. 2350/2020 · manejo nutricional en fase ambulatoria. Los campos con * son obligatorios.</p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-slate-700">Antropometría</legend>
        <Campo label="Fecha de consulta *"><input type="date" name="fecha" max={hoy} defaultValue={hoy} required className="input" /></Campo>
        <Campo label="Peso en kilos (un decimal) *"><input name="peso" inputMode="decimal" required pattern="\d{1,2}([.,]\d)?" placeholder="Ej: 9.4" className="input" /></Campo>
        <Campo label="Talla en cm (un decimal) *"><input name="talla" inputMode="decimal" required pattern="\d{2,3}([.,]\d)?" placeholder="Ej: 78.5" className="input" /></Campo>
        <Campo label="Puntaje Z (peso/talla) *">
          <input value={z} onChange={e => setZ(e.target.value)} inputMode="decimal" required pattern="-?\d([.,]\d{1,4})?" placeholder="Ej: -2.35" className="input" />
        </Campo>
        <Campo label="Clasificación (peso/talla)">
          <input name="clasificacion" placeholder={sugerida || 'Se sugiere con el Z'} className="input" />
          {sugerida && <span className="text-xs text-slate-500">Sugerida: {sugerida}</span>}
        </Campo>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-slate-700">Tratamiento</legend>
        <Campo label="Requerimiento de energía FTLC (kcal/kg/día)"><input name="energia" maxLength={60} placeholder="Ej: 150 KCAL/KG/DIA" className="input" /></Campo>
        {conFechaFtlc && <Campo label="Fecha de entrega de FTLC"><input type="date" name="fechaEntregaFtlc" max={hoy} className="input" /></Campo>}
        <Campo label="Medicamento" ancho><input name="medicamento" maxLength={300} placeholder="Ej: PLUMPY NUT / ÁCIDO FÓLICO" className="input" /></Campo>
      </fieldset>

      <fieldset className="grid gap-3 lg:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-slate-700">Seguimiento</legend>
        <label className="flex flex-col gap-1 rounded-lg border-2 border-dashed border-marca-600 bg-marca-50 p-3 text-sm lg:col-span-2">
          <span className="font-semibold text-marca-900">Historia clínica de este control * (obligatoria)</span>
          <input name="historia" type="file" required accept={ACEPTA_HC}
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-600 file:px-3 file:py-2 file:text-white" />
          <span className="text-xs text-slate-600">PDF, JPG o PNG · máx. {TAMANO_MAX_HC / MB} MB. Queda ligada al control {numeroSiguiente}.</span>
          {progreso != null && (
            <span className="mt-1 block h-2 rounded bg-white">
              <span className="block h-2 rounded bg-marca-600 transition-all" style={{ width: `${progreso}%` }} />
            </span>
          )}
        </label>
        <Campo label="Recomendaciones y manejo"><textarea name="recomendaciones" rows={3} maxLength={1500} className="input" /></Campo>
        <Campo label="Resultados del seguimiento *"><textarea name="resultado" rows={3} required maxLength={1500} className="input" placeholder="Tolerancia a FTLC, ganancia de peso, signos de alarma…" /></Campo>
        <Campo label="Observaciones"><textarea name="observaciones" rows={2} maxLength={1500} className="input" /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre de la IPS que realiza el seguimiento"><input name="ips" defaultValue={ips} maxLength={150} className="input" /></Campo>
          <Campo label="Profesional que presta la atención (extramural/intramural) *"><input name="profesional" defaultValue={profesional} required maxLength={150} className="input" /></Campo>
          <Campo label="Estado del niño/a">
            <select name="estado" defaultValue="" className="input">
              <option value="">Sin cambio ({estadoActual})</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e === 'RECAIDA' ? 'REINCIDENTE (RECAÍDA)' : e}</option>)}
            </select>
          </Campo>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : `Guardar control ${numeroSiguiente}`}</button>
        {mensaje && <span className={`text-sm ${mensaje.ok ? 'text-marca-700' : 'text-red-600'}`}>{mensaje.texto}</span>}
      </div>
    </form>
  );
}

function Campo({ label, children, ancho }: { label: string; children: React.ReactNode; ancho?: boolean }) {
  return <label className={`flex flex-col gap-1 text-sm ${ancho ? 'sm:col-span-2' : ''}`}>{label}{children}</label>;
}
