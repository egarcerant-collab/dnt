'use client';

import { useActionState, useState } from 'react';
import { accionGuardarFirma, type EstadoAccion } from '@/app/acciones';

export function FormFirma({ cargo, compartida, tieneFirma }: { cargo: string; compartida: boolean; tieneFirma: boolean }) {
  const [estado, accion, enviando] = useActionState<EstadoAccion, FormData>(accionGuardarFirma, null);
  const [vista, setVista] = useState<string | null>(null);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Cargo (aparece debajo de tu nombre)</span>
        <input name="cargo" required defaultValue={cargo} maxLength={80} placeholder="Ej.: Líder ruta de alteraciones nutricionales"
          className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{tieneFirma ? 'Reemplazar imagen de la firma (opcional)' : 'Imagen de la firma'}</span>
        <input name="imagen" type="file" accept="image/png,image/jpeg" required={!tieneFirma}
          onChange={e => { const f = e.target.files?.[0]; setVista(f ? URL.createObjectURL(f) : null); }}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-2 file:text-marca-700" />
        <span className="text-xs text-slate-500">
          PNG (ideal con fondo transparente) o JPG, máximo 500 KB. Firma en tinta negra o azul sobre papel blanco, escaneada o fotografiada y recortada.
        </span>
      </label>
      {vista && <img src={vista} alt="Vista previa de la nueva firma" className="h-20 w-fit rounded border border-slate-200 bg-white object-contain p-1" />}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="compartida" defaultChecked={compartida} className="mt-1" />
        <span>Permitir que otros funcionarios EPSI incluyan mi firma en los informes que generen (por ejemplo, como coordinador o director que avala el informe).</span>
      </label>
      <button className="boton w-fit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar firma'}</button>
      {estado && <p className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.mensaje}</p>}
    </form>
  );
}
