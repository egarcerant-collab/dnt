# DNT · Monitoreo Desnutrición — Dusakawi EPSI

Seguimiento niño a niño de desnutrición aguda en menores de 5 años (evento 113 SIVIGILA), según la Res. 2350/2020 y la Res. 5406/2015. Repositorio de prueba con el **módulo de prestadores**.

## Roles

| Rol | Ingreso | Qué hace |
|---|---|---|
| **Funcionario EPSI** | Usuario + contraseña | Indicadores, filtros departamento → municipio → IPS, exportaciones, notificaciones a prestadores |
| **Administrador** | Usuario + contraseña | Todo lo anterior + gestión de usuarios y del catálogo de prestadores (NIT) |
| **Prestador (IPS)** | Busca su IPS por nombre o NIT; **primer ingreso con el NIT**, luego crea su contraseña personal (obligatorio) | Diligencia AX y los 19 controles (AY–KF), responde notificaciones y carga historias clínicas |

## Módulo de prestadores (libro `plantillas/libro-prestadores.xlsx`)

- **Columnas A–AW (azules):** datos cargados por la EPSI desde la base SIVIGILA; el prestador los ve en solo lectura.
- **Columna AX:** IPS / ESE de atención primaria, diligenciada por el prestador.
- **Columnas AY–KF:** 19 bloques de control con fecha, peso, talla, Z, clasificación, energía FTLC, fecha de entrega FTLC, medicamento, recomendaciones, resultado, IPS, observaciones y profesional.
- **Notificaciones y preguntas** por niño o generales por IPS, con contador de no leídos.
- **Historia clínica:** PDF/JPG/PNG hasta 10 MB; el tipo se valida por la firma del archivo y la descarga exige sesión y permisos.
- **Matriz completa A–KF:** exporta la base en el formato del libro con lo diligenciado por los prestadores.

El NIT de cada IPS se toma automáticamente de SIVIGILA (`nom_upgd` / `nit_upgd`) y el administrador debe confirmarlo o corregirlo en *Administración*.

## Uso

```bash
npm install
npm run dev        # http://localhost:3000 (o PORT)
npm run analizar   # indicadores agregados por consola
```

Variables en `.env.local` (ver `.env.example`): `DNT_EXCEL_PATH`, `ADMIN_USUARIO`, `ADMIN_PASSWORD`, `SESSION_SECRET` y, para Google Drive, `GDRIVE_FOLDER_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`.

## Seguridad

- Repositorio **público**: nunca subir bases con datos de los niños (Ley 1581/2012, Res. 1995/1999). `.gitignore` bloquea `data/`, `*.xlsx` (salvo `plantillas/`), `*.csv` y `.env*`.
- Contraseñas con PBKDF2-SHA512, sesión firmada en cookie httpOnly, bloqueo tras 5 intentos fallidos.
- Exportaciones registradas en `data/app/auditoria-exportaciones.json`.
- Prototipo de una sola instancia: el almacenamiento JSON serializa escrituras por proceso; para producción con varias instancias se recomienda una base de datos.
