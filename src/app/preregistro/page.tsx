import { redirect } from 'next/navigation';

/** Pre-registro quedó unificado con Cruce de bases en una sola pestaña. */
export default function Preregistro() {
  redirect('/cruce?vista=pre');
}
