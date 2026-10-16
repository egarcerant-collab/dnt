import { redirect } from 'next/navigation';

/** Mi firma quedó unificada con Informes PDF en una sola pestaña. */
export default function MiFirma() {
  redirect('/informes?vista=firma');
}
