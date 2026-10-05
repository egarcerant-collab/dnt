/** Se muestra al instante al cambiar de pestaña, mientras el servidor prepara la página. */
export default function Cargando() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <img src="/nutria.svg" alt="" className="h-20 w-20 animate-bounce rounded-full shadow" />
      <p className="text-sm font-medium text-marca-800">Cargando…</p>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-marca-100">
        <div className="h-full w-1/3 animate-[cargando_1.1s_ease-in-out_infinite] rounded-full bg-marca-600" />
      </div>
    </div>
  );
}
