# Análisis de indicadores DNT aguda — Corte SE 36 / 2026

Fuente: `BASE DE DATOS DNT 36` (matriz "BD seg ambulatorio DNTA" + hoja SIVIGILA "SEM 36").
Población: menores de 0–59 meses, evento 113, afiliados Dusakawi EPSI. Notificaciones del 05/01/2026 al 09/09/2026.
Reproducible con `npm run analizar`. Documento solo con agregados, sin datos identificables.

## 1. Magnitud

| Indicador | Valor |
|---|---|
| Casos en matriz de seguimiento | 517 |
| Casos notificados SIVIGILA (SE 36) | 521 |
| Cesar / La Guajira / Magdalena | 253 (48,9%) / 243 (47,0%) / 21 (4,1%) |
| Top municipios | Agustín Codazzi 116, Uribia 100, Pueblo Bello 64, Valledupar 59, Riohacha 35 |
| Población indígena | 69,4% (Yukpa 127, Arhuaca 89, Wayuu 85, Kogui 30, Wiwa 19) |
| Sexo M / F | 60,2% / 39,8% |
| Edad: <6m / 6–11m / 12–23m / 24–59m | 44 / 76 / 211 / 186 |
| Severidad al ingreso: moderada / severa / sin clasificar | 262 / 70 / 185 |
| Hospitalizados según SIVIGILA | 161 (30,9%) |

Lectura: la carga se concentra en Codazzi (Yukpa) y Uribia (Wayuu). El 40,8% son menores de 2 años, grupo de mayor riesgo de mortalidad. El 23% de la matriz son niños <12 meses.

## 2. Desenlaces

| Indicador | Valor | Referencia |
|---|---|---|
| Recuperados | 203 | — |
| % recuperación sobre total | 39,3% | Meta Res. 2350/2020: ≥75% |
| % recuperación sobre casos con estado diligenciado | 61,9% | ≥75% |
| En proceso de recuperación | 117 | — |
| Fallecidos | 4 → letalidad 0,8% | Meta <1% (umbral Esfera <10%) |
| Deserción + búsqueda fallida | 2 | ≤15% |
| **Sin estado diligenciado** | **189 (36,6%)** | 0% |
| Recuperados por depto | La Guajira 47,3% · Cesar 34,8% · Magdalena 0% | — |

Hallazgos:
- La recuperación real no se puede calcular: 1 de cada 3 niños no tiene estado. Magdalena no reporta ningún estado.
- Subregistro de recuperación: ~234 niños tienen en su último control "peso adecuado para la talla", pero solo 203 figuran como RECUPERADO.
- 2 de las 4 muertes eran DNT severa. Ninguna de las 4 aparece como fallecida en SIVIGILA (`con_fin_` = 1 en los 521 registros). Hay que hacer el ajuste en SIVIGILA y la unidad de análisis.

## 3. Oportunidad

| Indicador | Valor | Estándar |
|---|---|---|
| Notificación → 1er control (mediana / p90) | 13 d / 45 d | Día 3 (severa) – día 7 (moderada) |
| % con 1er control ≤7 días | 24,4% | ≥90% |
| 1er → 2do control (mediana) | 12 d | 7 d |
| Notificación → entrega FTLC (mediana) | 0 d | ≤1 d ✔ |
| Notificación → recuperación (mediana / p90) | 37 d / 91 d | Egreso ≤ 8–12 semanas |

Lectura: la FTLC sí se entrega a tiempo, pero el control clínico llega tarde. Solo 1 de cada 4 niños tiene su primer control dentro de la ventana de la Res. 2350. Este es el principal punto crítico del proceso.

## 4. Adherencia al seguimiento

| Indicador | Valor |
|---|---|
| Promedio de controles por niño | 2,05 |
| Niños con 0 controles | 143 (27,7%) |
| Sin control y notificados hace >4 semanas | **93 → alerta de búsqueda activa** |
| Niños con ≥4 controles | 113 (21,9%) |

## 5. Calidad del dato

| Campo | Completitud |
|---|---|
| Z-score P/T ingreso | 96,7% |
| Clasificación de ingreso | 66,3% |
| Estado actual | 63,4% |
| Perímetro braquial | 64,0% |
| Etiología primaria | 62,3% |
| Prescripción MIPRES FTLC | 60,7% |
| Vacunación / RPMS 3280 | 61,3% |
| Fecha de recuperación | 31,3% |
| Edad en meses (columna) | ~4% (se recalcula desde la fecha de nacimiento) |

Problemas estructurales:
- 21 variantes de texto para la clasificación de ingreso, 9 para edema y 48 para el nombre de IPS (ej.: "WINTUKWA IPS" vs "WINTUKWA I.P.S.I.").
- 17 registros con el primer control antes de la notificación. 2 documentos duplicados.
- Fechas mezcladas: texto dd/mm/aaaa y fecha Excel con hora 05:00:16 (viene de un copiado masivo).
- 11 casos SIVIGILA sin fila de seguimiento y 5 de seguimiento sin SIVIGILA (hay que normalizar el tipo/formato de documento antes del cruce definitivo).
- La hoja "Hoja4" trae indicadores históricos (1.025 casos, 64,1% de recuperación) que no corresponden al corte 2026.

## 6. Insights accionables

1. **Búsqueda activa inmediata** de los 93 niños sin ningún control y más de 4 semanas desde la notificación. Priorizar a los <24 meses y a los severos.
2. **Cerrar el estado** de los 189 casos sin desenlace. Magdalena: 100% sin estado.
3. **Ajuste SIVIGILA** de las 4 defunciones y unidad de análisis de mortalidad.
4. **Oportunidad del 1er control**: meta ≥90% ≤7 d. Hoy está en 24%. Ver por IPS (Dusakawi IPS, Wintukwa y Supula Wayuu concentran el 54%).
5. **Reclasificar como RECUPERADO** a los niños con P/T adecuado sostenido (~31 casos).
6. **Estandarizar la captura** con listas desplegables (hojas CODIGOS/Hoja1 ya existen, pero no se aplican) o migrar a la app.

## 7. Indicadores propuestos para la app "Monitoreo Desnutrición"

| # | Indicador | Fórmula | Meta |
|---|---|---|---|
| 1 | % recuperación | recuperados / (casos − descartados) | ≥75% |
| 2 | Letalidad | fallecidos / casos | <1% |
| 3 | Oportunidad 1er control | casos con control ≤3 d (severa) o ≤7 d (moderada) / casos | ≥90% |
| 4 | Adherencia | casos con controles semanales completos / casos activos | ≥80% |
| 5 | Casos sin control >4 sem | conteo | 0 |
| 6 | Deserción | desertados + búsqueda fallida / casos | ≤15% |
| 7 | Tiempo a recuperación | mediana de días entre notificación y recuperación | ≤60 d |
| 8 | Concordancia SIVIGILA | casos cruzados / notificados | 100% |
| 9 | Completitud crítica | registros con estado, clasificación, PB y MIPRES / casos | ≥95% |
| 10 | Recaída / reingreso | reingresos / recuperados | <5% |
