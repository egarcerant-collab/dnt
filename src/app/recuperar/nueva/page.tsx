import { FormNuevaClave } from '@/components/form-recuperar';
import { revisarToken } from '@/lib/recuperacion';

export const dynamic = 'force-dynamic';

export default async function NuevaClave({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = '' } = await searchParams;
  const r = await revisarToken(t);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-marca-600 bg-white shadow-lg">
        <div className="bg-marca-700 px-6 py-5 text-white">
          <h1 className="text-lg font-bold">Crear nueva contraseña</h1>
          <p className="text-sm text-white/85">{r.ok ? r.etiqueta : 'Nutria · Monitoreo de Desnutrición'}</p>
        </div>
        <div className="flex flex-col gap-4 px-8 py-6">
          {r.ok ? (
            <FormNuevaClave token={t} />
          ) : (
            <>
              <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800">El enlace no es válido, ya se usó o venció (dura 30 minutos). Solicita uno nuevo.</p>
              <a href="/recuperar" className="boton text-center">Solicitar un nuevo enlace</a>
            </>
          )}
          <a href="/" className="text-center text-sm text-marca-700 hover:underline">← Volver al ingreso</a>
        </div>
      </div>
    </main>
  );
}
