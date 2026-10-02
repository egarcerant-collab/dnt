import { NextResponse } from 'next/server';
import { leerExcel } from '@/lib/dnt/excel-source';
import { registrarAtencionPrimaria, registrarControl } from '@/lib/dnt/repositorio';
import { ESTADOS, type Estado, type NuevoControlInput } from '@/lib/dnt/types';
import { hoyColombia } from '@/lib/fecha';
import { getSesion } from '@/lib/sesion';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

function validar(b: any): NuevoControlInput | string {
  if (!FECHA.test(b?.fecha ?? '')) return 'Fecha de consulta inválida';
  if (b.fecha > hoyColombia()) return 'La fecha de consulta no puede ser futura';
  if (!(b.peso > 1 && b.peso < 40)) return 'Peso fuera de rango (1–40 kg)';
  if (!(b.talla > 40 && b.talla < 130)) return 'Talla fuera de rango (40–130 cm)';
  if (!(b.zPesoTalla > -7 && b.zPesoTalla < 5)) return 'Z-score fuera de rango (-7 a 5)';
  if (b.fechaEntregaFtlc && (!FECHA.test(b.fechaEntregaFtlc) || b.fechaEntregaFtlc > hoyColombia())) return 'Fecha de entrega FTLC inválida';
  if (!txt(b.resultado, 1).length) return 'Describe el resultado del seguimiento';
  if (!txt(b.profesional, 1).length) return 'Indica el profesional que presta la atención';
  if (b.estado && !ESTADOS.includes(b.estado)) return 'Estado inválido';
  return {
    fecha: b.fecha,
    peso: b.peso,
    talla: b.talla,
    zPesoTalla: b.zPesoTalla,
    clasificacion: txt(b.clasificacion, 80),
    energia: txt(b.energia, 60),
    fechaEntregaFtlc: b.fechaEntregaFtlc || null,
    medicamento: txt(b.medicamento, 300),
    recomendaciones: txt(b.recomendaciones, 1500),
    resultado: txt(b.resultado, 1500),
    ips: txt(b.ips, 150),
    observaciones: txt(b.observaciones, 1500),
    profesional: txt(b.profesional, 150),
    estado: b.estado as Estado | undefined,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion || sesion.debeCambiarClave || (sesion.rol !== 'prestador' && sesion.rol !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const id = decodeURIComponent((await params).id);
  const caso = (await leerExcel()).casos.find(c => c.id === id);
  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 });
  if (sesion.rol === 'prestador' && caso.ipsSeguimiento !== sesion.ips) {
    return NextResponse.json({ error: 'El caso no pertenece a tu IPS' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  try {
    // Columna AX (IPS/ESE de atención primaria)
    if (body?.accion === 'atencion-primaria') {
      if (!txt(body.valor, 1)) return NextResponse.json({ error: 'Indica la IPS / ESE de atención primaria' }, { status: 400 });
      await registrarAtencionPrimaria(id, body.valor);
      return NextResponse.json({ ok: true });
    }
    const entrada = validar(body);
    if (typeof entrada === 'string') return NextResponse.json({ error: entrada }, { status: 400 });
    const numero = await registrarControl(id, entrada, sesion.nombre);
    return NextResponse.json({ ok: true, numero });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
