import { semaforoDe } from './semaforo';
import type { Caso, TipoAlerta } from './types';

export interface FiltrosCasos {
  depto?: string;
  municipio?: string;
  ips?: string;
  estado?: string;
  clasificacion?: string; // clasificación nutricional detallada
  alerta?: string;
  edad?: string;
  semaforo?: string; // clave del semáforo del estado actual
  controles?: string; // "0", "1"…"5", "6+" o "1+" (número de controles AY..KF)
  etnia?: string; // pueblo indígena (ver etniaDe)
  sexo?: string; // Femenino / Masculino / Sin dato
}

/** Último puntaje Z peso/talla registrado (o el de ingreso si no hay controles). */
export function ultimoZ(c: Caso): number | null {
  const conFecha = c.controles.filter(k => k.fecha && k.zPesoTalla != null).sort((a, b) => a.fecha!.localeCompare(b.fecha!));
  return conFecha.at(-1)?.zPesoTalla ?? c.zIngreso;
}

export const semaforoCaso = (c: Caso) => semaforoDe(c.estado, ultimoZ(c));

/** Grupo por número de controles registrados (AY..KF + app). */
export function grupoControles(c: Caso): string {
  const n = c.controles.length;
  return n >= 6 ? '6+' : String(n);
}
export const GRUPOS_CONTROLES = ['0', '1', '2', '3', '4', '5', '6+'];

export function grupoEdad(c: Caso): string {
  const m = c.edadMeses;
  if (m == null) return 'Sin dato';
  return m < 6 ? '< 6 meses' : m < 12 ? '6–11 meses' : m < 24 ? '12–23 meses' : '24–59 meses';
}

/** Pueblo indígena normalizado para agrupar (variantes de escritura unificadas). */
export function etniaDe(c: Pick<Caso, 'etnia'>): string {
  const e = (c.etnia || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!e || /^(SIN|NO |NINGUN|N\/A|OTRO)/.test(e)) return 'SIN ETNIA REGISTRADA';
  if (/WAYU|GUAJIRO/.test(e)) return 'WAYUU';
  if (/ARHUAC|^IKA$|IJKA/.test(e)) return 'ARHUACO';
  if (/KOGU|KAGGAB/.test(e)) return 'KOGUI';
  if (/WIWA|ARSARIO|SANKA/.test(e)) return 'WIWA';
  if (/KANKUAM/.test(e)) return 'KANKUAMO';
  if (/YUKP|YUCP/.test(e)) return 'YUKPA';
  if (/ETTE|CHIMILA/.test(e)) return 'ETTE ENNAKA (CHIMILA)';
  if (/ZENU/.test(e)) return 'ZENU';
  if (/^INDIGENA$/.test(e)) return 'INDÍGENA (PUEBLO NO ESPECIFICADO)';
  return e;
}

export function sexoDe(c: Pick<Caso, 'sexo'>): string {
  const s = (c.sexo || '').toUpperCase();
  return s.startsWith('F') ? 'Femenino' : s.startsWith('M') ? 'Masculino' : 'Sin dato';
}

/** Filtro único usado por la vista EPSI y la exportación, para que ambas muestren lo mismo. */
export function filtrarCasos(casos: Caso[], f: FiltrosCasos): Caso[] {
  return casos.filter(
    c =>
      (!f.depto || c.departamento === f.depto) &&
      (!f.municipio || c.municipio === f.municipio) &&
      (!f.ips || c.ipsSeguimiento === f.ips) &&
      (!f.estado || c.estado === f.estado) &&
      (!f.clasificacion || c.clasificacionNutricional === f.clasificacion) &&
      (!f.alerta || c.alertas.includes(f.alerta as TipoAlerta)) &&
      (!f.edad || grupoEdad(c) === f.edad) &&
      (!f.semaforo || semaforoCaso(c).clave === f.semaforo) &&
      (!f.controles || (f.controles === '1+' ? c.controles.length > 0 : grupoControles(c) === f.controles)) &&
      (!f.etnia || etniaDe(c) === f.etnia) &&
      (!f.sexo || sexoDe(c) === f.sexo),
  );
}

export function aQueryString(f: FiltrosCasos): string {
  return new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
}
