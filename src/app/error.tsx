'use client';

/** Pantalla de error amigable (en producción Next.js oculta el detalle). */
export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold text-marca-900">No se pudo cargar esta página</h1>
      <p className="text-slate-600">
        Suele deberse a la conexión con Google Drive (permisos de la carpeta o la cuenta de servicio) o a que la base no está cargada.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>Si eres administrador, abre el <a href="/api/admin/diagnostico" className="font-semibold text-marca-700 underline">diagnóstico</a> para ver qué falta.</li>
        <li>Código de referencia: <code>{error.digest ?? 'n/d'}</code></li>
      </ul>
      <div className="flex gap-3">
        <button onClick={reset} className="boton">Reintentar</button>
        <a href="/" className="boton-sec">Ir al inicio</a>
      </div>
    </main>
  );
}
