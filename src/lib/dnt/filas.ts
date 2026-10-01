import type { Caso, Estado, Severidad, TipoAlerta } from './types';

/** Proyección liviana de un caso para enviar a componentes de cliente. */
export interface FilaCaso {
  id: string;
  nombre: string;
  documento: string;
  edadMeses: number | null;
  sexo: string;
  departamento: string;
  municipio: string;
  etnia: string;
  ips: string;
  severidad: Severidad;
  estado: Estado;
  fechaNotificacion: string | null;
  ultimoControl: string | null;
  ultimaClasificacion: string;
  ultimoZ: number | null;
  nControles: number;
  alertas: TipoAlerta[];
}

export function aFila(c: Caso): FilaCaso {
  const conFecha = c.controles.filter(k => k.fecha).sort((a, b) => a.fecha!.localeCompare(b.fecha!));
  const ultimo = conFecha[conFecha.length - 1];
  return {
    id: c.id,
    nombre: c.nombre,
    documento: c.documento,
    edadMeses: c.edadMeses,
    sexo: c.sexo,
    departamento: c.departamento,
    municipio: c.municipio,
    etnia: c.etnia,
    ips: c.ipsSeguimiento,
    severidad: c.severidad,
    estado: c.estado,
    fechaNotificacion: c.fechaNotificacion,
    ultimoControl: ultimo?.fecha ?? null,
    ultimaClasificacion: ultimo?.clasificacion ?? c.clasificacionIngreso,
    ultimoZ: ultimo?.zPesoTalla ?? c.zIngreso,
    nControles: c.controles.length,
    alertas: c.alertas,
  };
}
