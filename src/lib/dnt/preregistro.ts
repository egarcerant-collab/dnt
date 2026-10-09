import 'server-only';
import crypto from 'crypto';
import { departamentoCanonico, ipsCanonica, municipioCanonico } from './catalogo';
import { clasificacionNutricional, norm, severidadDe, type CasoBase } from './excel-source';
import { ARCHIVO_ADICIONALES, casosFuente, leerAdicionales } from './fuente';
import { actualizarJson, getStore } from './store';

/**
 * Pre-registro de niños de bases externas de seguimiento (p. ej. SeguimientoDNT del INS).
 * Cada carga del archivo queda como un "cargue". Los niños que faltan en Nutria se guardan con TODAS
 * las columnas del archivo, sin tocar la base. Se verifican uno a uno (IPS de seguimiento asignada)
 * y solo los verificados se incorporan a Nutria.
 */
const ARCHIVO = 'preregistro.json';
const MAX_POR_CARGUE = 3000;

export type EstadoPre = 'pendiente' | 'verificado' | 'descartado' | 'incorporado';

export interface Cargue {
  id: string;
  fecha: string;
  por: string;
  archivo: string;
  criterio: string;
  totalFilas: number;
  unicos: number;
  enviados: number;
  nuevos: number;
  actualizados: number;
  yaEnNutria: number;
}

export interface Preregistro {
  clave: string;
  documento: string;
  tipo: string;
  nombre: string;
  departamento: string;
  municipio: string;
  upgd: string;
  fecha: string;
  clasificacion: string;
  sinSeguimiento: boolean;
  registrosArchivo: number;
  /** Todas las columnas del registro más reciente del archivo. */
  datos: Record<string, string>;
  estado: EstadoPre;
  ipsSeguimiento?: string;
  nota?: string;
  cargues: string[];
  casoId?: string;
  historial: { fecha: string; por: string; accion: string }[];
}

interface DatosPre {
  cargues: Cargue[];
  registros: Record<string, Preregistro>;
}

export interface NinoCargue {
  clave: string;
  documento: string;
  tipo: string;
  nombre: string;
  departamento: string;
  municipio: string;
  upgd: string;
  fecha: string;
  clasificacion: string;
  sinSeguimiento: boolean;
  registros: number;
  datos: Record<string, string>;
}

const vacio = (): DatosPre => ({ cargues: [], registros: {} });
const clave = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
const corto = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);

export async function leerPreregistro(): Promise<DatosPre> {
  return (await getStore().leer<DatosPre>(ARCHIVO)) ?? vacio();
}

export async function registrarCargue(
  entrada: { archivo: string; criterio: string; totalFilas: number; unicos: number; ninos: NinoCargue[] },
  por: string,
): Promise<Cargue> {
  if (!Array.isArray(entrada.ninos) || !entrada.ninos.length) throw new Error('No hay niños para registrar en este cargue');
  if (entrada.ninos.length > MAX_POR_CARGUE) throw new Error(`Máximo ${MAX_POR_CARGUE} niños por cargue: aplique filtros (año, departamento)`);
  const enNutria = new Set((await casosFuente()).map(c => clave(c.documento)));
  const ahora = new Date().toISOString();
  const cargue: Cargue = {
    id: `C${ahora.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`,
    fecha: ahora,
    por,
    archivo: corto(entrada.archivo, 150),
    criterio: corto(entrada.criterio, 200),
    totalFilas: Number(entrada.totalFilas) || 0,
    unicos: Number(entrada.unicos) || 0,
    enviados: entrada.ninos.length,
    nuevos: 0,
    actualizados: 0,
    yaEnNutria: 0,
  };

  await actualizarJson<DatosPre>(ARCHIVO, vacio, d => {
    for (const n of entrada.ninos) {
      const k = clave(n.clave || n.documento);
      if (!k) continue;
      if (enNutria.has(k)) {
        cargue.yaEnNutria++;
        continue;
      }
      // Solo se guardan textos cortos: columnas del archivo (máximo 120)
      const datos = Object.fromEntries(Object.entries(n.datos ?? {}).slice(0, 120).map(([c, v]) => [corto(c, 60), corto(v, 300)]));
      const base = {
        documento: corto(n.documento, 30), tipo: corto(n.tipo, 5), nombre: corto(n.nombre, 120), departamento: corto(n.departamento, 60),
        municipio: corto(n.municipio, 60), upgd: corto(n.upgd, 150), fecha: corto(n.fecha, 10), clasificacion: corto(n.clasificacion, 60),
        sinSeguimiento: !!n.sinSeguimiento, registrosArchivo: Number(n.registros) || 1, datos,
      };
      const previo = d.registros[k];
      if (previo) {
        // Un niño ya pre-registrado se actualiza con los datos más recientes, sin perder su verificación
        if (previo.estado === 'incorporado') continue;
        Object.assign(previo, base);
        if (!previo.cargues.includes(cargue.id)) previo.cargues.push(cargue.id);
        previo.historial.push({ fecha: ahora, por, accion: `Actualizado en el cargue ${cargue.id}` });
        cargue.actualizados++;
      } else {
        d.registros[k] = { clave: k, ...base, estado: 'pendiente', cargues: [cargue.id], historial: [{ fecha: ahora, por, accion: `Pre-registrado en el cargue ${cargue.id}` }] };
        cargue.nuevos++;
      }
    }
    d.cargues.push(cargue);
  });
  return cargue;
}

async function cambiar(k: string, por: string, fn: (r: Preregistro) => string) {
  await actualizarJson<DatosPre>(ARCHIVO, vacio, d => {
    const r = d.registros[k];
    if (!r) throw new Error('Registro no encontrado');
    const accion = fn(r);
    r.historial.push({ fecha: new Date().toISOString(), por, accion });
  });
}

export async function verificarPre(k: string, datos: { ips: string; nota: string }, por: string) {
  const ips = ipsCanonica(datos.ips);
  if (!ips) throw new Error('Asigna la IPS de seguimiento');
  await cambiar(k, por, r => {
    if (r.estado === 'incorporado') throw new Error('Ya fue incorporado a Nutria');
    r.estado = 'verificado';
    r.ipsSeguimiento = ips;
    r.nota = corto(datos.nota, 300) || undefined;
    return `Verificado · IPS ${ips}${r.nota ? ` · ${r.nota}` : ''}`;
  });
}

export async function descartarPre(k: string, motivo: string, por: string) {
  const m = corto(motivo, 300);
  if (m.length < 5) throw new Error('Indica el motivo del descarte');
  await cambiar(k, por, r => {
    if (r.estado === 'incorporado') throw new Error('Ya fue incorporado a Nutria');
    r.estado = 'descartado';
    r.nota = m;
    return `Descartado · ${m}`;
  });
}

export async function reabrirPre(k: string, por: string) {
  await cambiar(k, por, r => {
    if (r.estado === 'incorporado') throw new Error('Ya fue incorporado a Nutria');
    r.estado = 'pendiente';
    return 'Devuelto a pendiente';
  });
}

const fechaDe = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const num = (v: string | undefined) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const util = (v: string | undefined) => (v && !/^SIN DATO$/i.test(v.trim()) ? v.trim() : '');

/** Convierte un pre-registro verificado en un caso de la base de seguimiento. */
function aCaso(r: Preregistro, id: string): CasoBase {
  const d = r.datos;
  const nacimiento = fechaDe(d.FechaNacimiento);
  const notificacion = fechaDe(d.FechaConsulta) ?? fechaDe(d.FechaRegistroCaso) ?? (r.fecha || null);
  const clasifTexto = d.NomClasificacionNutricional ?? r.clasificacion ?? '';
  const cn = clasificacionNutricional(clasifTexto, null);
  const edad = num(d.EdadMeses);
  return {
    id,
    consecutivo: null,
    tipoDocumento: norm(r.tipo || d.TipoIdentificacion),
    documento: r.documento,
    nombre: r.nombre,
    sexo: norm(d.Sexo),
    fechaNacimiento: nacimiento,
    edadMeses: edad ?? (nacimiento && notificacion ? Math.max(0, Math.floor((Date.parse(notificacion) - Date.parse(nacimiento)) / (864e5 * 30.44))) : null),
    departamento: departamentoCanonico(r.departamento || d.NomDeptoDistritoResidencia),
    municipio: municipioCanonico(r.municipio || d.NomMpioResidencia),
    asentamiento: util(d.Vereda) || util(d.CentroPoblado) || util(d.BarrioVereda) || util(d.DireccionResidencia),
    etnia: norm(d.NombreGrupoEtnico).replace('ARHUACO', 'ARHUACA'),
    telefono: '',
    semanaEpi: null,
    fechaNotificacion: notificacion,
    ipsInicial: ipsCanonica(r.upgd || d.NomUPGD),
    ipsSeguimiento: r.ipsSeguimiento!,
    severidad: severidadDe(cn.clasificacion),
    clasificacionNutricional: cn.clasificacion,
    clasificacionPorZ: false,
    clasificacionIngreso: clasifTexto,
    zIngreso: null,
    pesoIngreso: num(d.Peso),
    tallaIngreso: num(d.Talla),
    edema: '',
    perimetroBraquial: null,
    fechaEntregaFtlc: null,
    mipresFtlc: '',
    estado: /FALLEC/i.test(d.EstadoVital ?? '') ? 'FALLECIDO' : 'SIN DILIGENCIAR',
    fechaRecuperacion: null,
    ipsAtencionPrimaria: '',
    controles: [],
  };
}

/**
 * Incorpora a Nutria los pre-registros verificados indicados (o todos los verificados).
 * Primero se escriben los casos y luego se marcan como incorporados: si algo falla en medio,
 * al reintentar se reconoce el caso ya creado y solo se completa la marca.
 */
export async function incorporarPre(claves: string[] | 'verificados', por: string): Promise<number> {
  const [pre, existentes, adicionales] = await Promise.all([
    getStore().leer<DatosPre>(ARCHIVO, { fresco: true }).then(d => d ?? vacio()),
    casosFuente(),
    leerAdicionales(),
  ]);
  const lista = Object.values(pre.registros).filter(r => r.estado === 'verificado' && (claves === 'verificados' || claves.includes(r.clave)));
  if (!lista.length) throw new Error('No hay registros verificados para incorporar');

  const ids = new Set(existentes.map(c => c.id));
  const delExcel = new Set(existentes.filter(c => !adicionales[c.id]).map(c => clave(c.documento)));
  const yaIncorporado = new Map(Object.values(adicionales).map(c => [clave(c.documento), c.id]));
  const nuevos: CasoBase[] = [];
  const resultado = new Map<string, { casoId?: string; duplicado?: boolean }>();
  for (const r of lista) {
    if (yaIncorporado.has(r.clave)) resultado.set(r.clave, { casoId: yaIncorporado.get(r.clave) });
    else if (delExcel.has(r.clave)) resultado.set(r.clave, { duplicado: true });
    else {
      let id = r.documento || r.clave;
      for (let i = 2; ids.has(id); i++) id = `${r.documento}-${i}`;
      ids.add(id);
      nuevos.push(aCaso(r, id));
      resultado.set(r.clave, { casoId: id });
    }
  }

  if (nuevos.length) {
    await actualizarJson<Record<string, CasoBase>>(ARCHIVO_ADICIONALES, () => ({}), a => {
      nuevos.forEach(c => (a[c.id] = c));
    });
  }
  const ahora = new Date().toISOString();
  await actualizarJson<DatosPre>(ARCHIVO, vacio, d => {
    for (const [k, res] of resultado) {
      const r = d.registros[k];
      if (!r || r.estado !== 'verificado') continue;
      if (res.duplicado) {
        r.estado = 'descartado';
        r.nota = 'Ya existe en Nutria';
        r.historial.push({ fecha: ahora, por, accion: 'No se incorporó: el documento ya está en la base de Nutria' });
      } else {
        r.estado = 'incorporado';
        r.casoId = res.casoId;
        r.historial.push({ fecha: ahora, por, accion: `Incorporado a Nutria (IPS ${r.ipsSeguimiento})` });
      }
    }
  });
  return nuevos.length;
}
