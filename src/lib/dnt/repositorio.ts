import 'server-only';
import { leerExcel, norm } from './excel-source';
import { actualizarJson, getStore } from './store';
import { hoyColombia } from '../fecha';
import { MAX_CONTROLES, type Caso, type Control, type Estado, type NuevoControlInput, type TipoAlerta } from './types';

const ARCHIVO_SEGUIMIENTOS = 'seguimientos-app.json';
const DIAS_SIN_CONTROL = 28;
const DIAS_CONTROL_VENCIDO = 14;
const ESTADOS_CERRADOS: Estado[] = ['RECUPERADO', 'FALLECIDO', 'DESCARTADO', 'DESERTADO'];

interface RegistroApp {
  controles: Control[];
  estado?: Estado;
  fechaRecuperacion?: string | null;
  ipsAtencionPrimaria?: string;
  actualizadoEn: string;
}
type SeguimientosApp = Record<string, RegistroApp>;

const dias = (desde: string | null, hasta: string) =>
  desde ? Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 864e5) : null;


export function ultimoControl(c: Caso): Control | null {
  const conFecha = c.controles.filter(k => k.fecha);
  return conFecha.length ? conFecha.reduce((a, b) => (b.fecha! > a.fecha! ? b : a)) : null;
}

function calcularAlertas(c: Caso, corte: string): TipoAlerta[] {
  const a: TipoAlerta[] = [];
  const abierto = !ESTADOS_CERRADOS.includes(c.estado);
  const ultimo = ultimoControl(c);
  const desdeNotif = dias(c.fechaNotificacion, corte);

  if (abierto && c.controles.length === 0 && desdeNotif != null && desdeNotif > DIAS_SIN_CONTROL) a.push('SIN_CONTROL_4_SEMANAS');
  else if (abierto && ultimo && (dias(ultimo.fecha, corte) ?? 0) > DIAS_CONTROL_VENCIDO) a.push('CONTROL_VENCIDO');
  if (c.estado === 'FALLECIDO' && c.condicionFinalSivigila !== '2') a.push('FALLECIDO_SIN_AJUSTE_SIVIGILA');
  if (c.estado === 'SIN DILIGENCIAR') a.push('SIN_ESTADO');
  if (c.estado !== 'RECUPERADO' && ultimo && /PESO ADECUADO/.test(norm(ultimo.clasificacion))) a.push('POSIBLE_RECUPERADO');
  if (!c.enSivigila) a.push('NO_CRUZA_SIVIGILA');
  return a;
}

export interface Base {
  casos: Caso[];
  fechaCorte: string;
  almacenamiento: 'drive' | 'local';
  baseDisponible: boolean;
  origenBase: 'archivo-local' | 'almacenamiento' | 'ninguno';
  sivigila: { hoja: string | null; total: number; sinSeguimiento: number };
}

export async function obtenerBase(): Promise<Base> {
  const store = getStore();
  // Base y controles se leen en paralelo
  const [excel, appLeido] = await Promise.all([leerExcel(), store.leer<SeguimientosApp>(ARCHIVO_SEGUIMIENTOS)]);
  const app = appLeido ?? {};

  const casos: Caso[] = excel.casos.map(base => {
    const reg = app[base.id];
    const siv = excel.sivigila.get(base.documento);
    const controles = [...base.controles, ...(reg?.controles ?? [])].map((k, i) => ({ ...k, numero: i + 1 }));
    return {
      ...base,
      controles,
      estado: reg?.estado ?? base.estado,
      fechaRecuperacion: reg?.fechaRecuperacion ?? base.fechaRecuperacion,
      ipsAtencionPrimaria: reg?.ipsAtencionPrimaria ?? base.ipsAtencionPrimaria,
      enSivigila: !!siv,
      condicionFinalSivigila: siv?.condicionFinal ?? null,
      alertas: [],
    };
  });

  const corte = hoyColombia();
  casos.forEach(c => (c.alertas = calcularAlertas(c, corte)));

  const docs = new Set(casos.map(c => c.documento));
  return {
    casos,
    fechaCorte: corte,
    almacenamiento: store.tipo,
    baseDisponible: excel.disponible,
    origenBase: excel.origen,
    sivigila: {
      hoja: excel.hojaSivigila,
      total: excel.sivigila.size,
      sinSeguimiento: [...excel.sivigila.keys()].filter(d => !docs.has(d)).length,
    },
  };
}

export async function obtenerCaso(id: string): Promise<{ caso: Caso; fechaCorte: string } | null> {
  const base = await obtenerBase();
  const caso = base.casos.find(c => c.id === id);
  return caso ? { caso, fechaCorte: base.fechaCorte } : null;
}

/** Guarda un control diligenciado por el prestador (siguiente bloque libre de AY..KF). */
export async function registrarControl(id: string, input: NuevoControlInput, usuario: string): Promise<void> {
  const base = (await leerExcel()).casos.find(c => c.id === id);
  if (!base) throw new Error('Caso no encontrado');
  const ahora = new Date().toISOString();

  await actualizarJson<SeguimientosApp>(ARCHIVO_SEGUIMIENTOS, () => ({}), app => {
    const reg: RegistroApp = app[id] ?? { controles: [], actualizadoEn: '' };
    if (base.controles.length + reg.controles.length >= MAX_CONTROLES) {
      throw new Error(`El libro admite máximo ${MAX_CONTROLES} controles por niño`);
    }
    reg.controles.push({ numero: 0, ...input, origen: 'app', registradoPor: usuario, registradoEn: ahora });
    if (input.estado) {
      reg.estado = input.estado;
      if (input.estado === 'RECUPERADO') reg.fechaRecuperacion = input.fecha;
    }
    reg.actualizadoEn = ahora;
    app[id] = reg;
  });
}

/** Columna AX: IPS / ESE de atención primaria, diligenciada por el prestador. */
export async function registrarAtencionPrimaria(id: string, valor: string): Promise<void> {
  if (!(await leerExcel()).casos.some(c => c.id === id)) throw new Error('Caso no encontrado');
  await actualizarJson<SeguimientosApp>(ARCHIVO_SEGUIMIENTOS, () => ({}), app => {
    const reg: RegistroApp = app[id] ?? { controles: [], actualizadoEn: '' };
    reg.ipsAtencionPrimaria = valor.trim().slice(0, 150);
    reg.actualizadoEn = new Date().toISOString();
    app[id] = reg;
  });
}
