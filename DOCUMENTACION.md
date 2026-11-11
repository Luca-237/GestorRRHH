# Gestor de RRHH — Cindy Mayorista

Página para controlar al personal de todas las sucursales: vacaciones, francos, llegadas tarde, horas extra, licencias médicas, otras licencias y asistencia (horas de entrada y salida), con un tablero por sucursal.

## Stack
- **Front:** HTML + CSS + JavaScript sin frameworks, estilo Cindy (mismos tokens que el generador de rótulos).
- **Back:** Supabase (Postgres + login + permisos RLS + una Edge Function para administrar usuarios).
- **Hosting:** Ferozo, archivos estáticos. Sin servidor Node ni `.env` (no hay SSH).
- **Node.js** solo en la PC, para probar (servidor local y pruebas de la base).

## Roles
| Rol | Ve | Puede |
|---|---|---|
| **Admin** | Todas las sucursales | Todo: empleados, novedades, ajustes de vacaciones, asistencia, usuarios, sucursales, tipos de novedad |
| **Encargado** | Solo su sucursal | Cargar y corregir novedades y asistencia de su gente. No da de alta empleados ni ve Configuración |

Los permisos los aplica la **base** (RLS), no la página: aunque alguien modifique el JavaScript, no puede leer ni cambiar lo que no le corresponde.

## Secciones
- **Tablero:** indicadores del mes (activos, quién falta hoy, llegadas tarde, horas extra, licencias, faltas), próximas ausencias, resumen por sucursal y por empleado. Clic en un empleado → ficha.
- **Empleados:** lista con búsqueda; alta y edición (admin). Solo datos laborales: **los datos de salud y de emergencia no van en este sistema.**
- **Novedades:** lista por mes, tipo y empleado; carga y corrección; **Exportar para liquidación** (CSV para Excel con una fila por empleado y los totales del mes, para el estudio contable).
- **Vacaciones:** días que corresponden por antigüedad (LCT art. 150), tomados, ajustes y saldo por período.
- **Calendario:** rectángulos redondeados de color por ausencia o evento, como Google Calendar (en celular, lista por día).
- **Viaje:** novedad para cuando mandan a un empleado a una localidad cercana. Cuenta como ausencia del local (calendario y "hoy no están") y no descuenta vacaciones.
- **Modelo v2 (30/10/2026), adaptado a la planilla de Antonella "RRHH - Novedades Laborales v2":**
  - **Empleados:** legajo automático (últimos 3 del DNI + inicial del nombre + inicial del apellido, como en la planilla), sector, hora de entrada, fecha de nacimiento, email, dirección, obra social, banco, contacto de emergencia y motivo de baja. Los ven todos los usuarios con acceso a esa sucursal.
  - **Alta y baja** quedan registradas solas como novedad (al cargar un empleado y al desactivarlo).
  - **Llegadas tarde:** se carga la hora de llegada y los minutos se calculan con la hora de entrada del empleado (09:00 si no tiene). **Cada 3 llegadas tarde acumuladas** (3.ª, 6.ª, 9.ª…) la base genera una falta injustificada; si se borra esa llegada, se borra su falta.
  - **Horas extra:** hora de inicio, recargo sugerido (100% domingos, feriados y sábados desde las 13) y estado de liquidación. Sección **Horas extra**: pendientes de liquidar (se tildan y se marcan como liquidadas en el sueldo de un mes) y liquidadas por mes.
  - **Vacaciones:** los **goces** (días tomados) se separan de las **liquidaciones** (nota de vacaciones / pago). Al cargar una liquidación, los goces de ese período quedan marcados como liquidados.
  - **Montos en pesos:** adelantos de sueldo y viáticos. **Registros sin cantidad:** cambio de obra social, alta, baja. **Licencia por accidente.**
  - **Feriados** en Configuración.
  - Migración: `supabase/migrations/20261030000000_modelo_rrhh_v2.sql`. Carga de la planilla: `datos-privados/carga-planilla-antonella.sql` (no va al repo).
- **Calendario:** mes completo con las ausencias cargadas (color de su tipo) y **eventos** con colores (inventario, capacitación, cierre…). Clic en un día: nuevo evento; en un evento: editarlo; en una ausencia: la ficha. Un admin carga eventos para todas las sucursales o una; un encargado, solo para la suya. En celular se ve como lista. Un día con borde rojo tiene a dos integrantes de un mismo puesto compartido de vacaciones (datos viejos).
- **Puestos compartidos:** grupos de personas que se cubren entre sí; **solo una puede estar de vacaciones a la vez**. Lo controla la base: no deja guardar vacaciones que se superpongan con las de otro integrante (con un mensaje que dice quién y en qué fechas). Los arma un admin; el formulario de vacaciones avisa con quién comparte puesto. Migración `20261031000000_calendario_puestos_compartidos.sql`.
- **Descuentos de sueldo:** separa dos orígenes que antes se cargaban juntos como "adelanto". **Adelanto de sueldo** = plata que se le da al empleado por adelantado. **Compra en cuenta corriente** = mercadería que compró en la tienda y paga después. Los dos se descuentan del sueldo (el viático no). Cada movimiento queda "pendiente de descontar" hasta que se marca el mes del sueldo en el que se descontó. La sección muestra lo pendiente por empleado (adelantos, compras y total), los movimientos para tildar y marcar como descontados, y lo descontado por mes. El tablero separa el dinero del mes y suma "Para descontar del sueldo"; la exportación trae columnas separadas. Para corregir uno ya cargado: clic en su fecha → cambiar el tipo. Migración `20261031020000_compras_cuenta_corriente.sql`.
- **Cuenta de horas:** cuenta corriente de las horas que debe cada empleado. Suman a la deuda los permisos de horas y los días pedidos a devolver; la descuentan las devoluciones (horas trabajadas de más para compensar). Muestra saldo por empleado (debe / a favor), todos los movimientos y, en la ficha, el resumen con el saldo después de cada movimiento. Los días se pasan a horas con la jornada del empleado (8 si no tiene). El tablero suma "Horas adeudadas" y la exportación para liquidación trae el saldo de cada uno.
  - Qué tipos mueven la cuenta se elige en **Configuración → Tipos de novedad → Cuenta de horas** (ej. se puede hacer que las llegadas tarde se devuelvan). Por defecto solo mueven la cuenta los tres tipos nuevos.
- **Configuración (admin):** usuarios, sucursales, **puestos**, tipos de novedad (se pueden agregar más) y horarios y minutos a favor.
  - **Puestos:** lista administrable. Al renombrar uno se actualiza en todos los empleados que lo tienen (la base lo hace en cascada). No se borran: se desactivan y dejan de ofrecerse en el formulario. El puesto de un empleado solo puede ser uno de la lista (o "Sin puesto").
- **Cambiar puesto o sucursal de un empleado:** Empleados → **Editar** en la fila (o desde la ficha → Editar datos). Solo admin.

## Reglas de cálculo
- **Días** (vacaciones, francos, licencias, faltas): corridos, de "desde" a "hasta" inclusive. La base los calcula sola.
- **Llegadas tarde:** minutos. **Horas extra:** horas, al 50% o al 100%.
- **Vacaciones que corresponden** (antigüedad al 31/12 del período): hasta 5 años 14 días; más de 5 hasta 10, 21; más de 10 hasta 20, 28; más de 20, 35. Con menos de 6 meses en el año: 1 día cada 20 trabajados (aproximado con 6 días por semana).
- **Período vacacional:** el de la empresa, del 1 de octubre de un año al 30 de septiembre del siguiente (no se usa la ventana de la ley, de octubre a abril). Lo tomado de enero a septiembre se descuenta, por defecto, del período del año anterior (se puede elegir otro al cargar). Los días prohibidos (Configuración) están dentro de ese período. Migración `20261106010000_periodo_vacacional_empresa.sql`.
- Días arrastrados, acuerdos o correcciones: **Vacaciones → Ajuste** (admin).

## Estructura
```
index.html                 pantallas y diálogos
css/app.css                estilos
js/config.js               URL y clave pública de Supabase
js/utils.js                fechas, formatos, CSV, avisos
js/calculos.js             vacaciones, resúmenes, ausentes (sin pantalla)
js/api.js                  única capa de datos (todo lo que habla con Supabase)
js/main.js                 arranque, sesión y navegación por #secciones
js/vistas/*.js             una vista por sección + ficha del empleado
supabase/migrations/*.sql  tablas, triggers y permisos
supabase/functions/admin-usuarios/index.ts   alta de usuarios, roles, contraseñas
pruebas/api-falsa.js       base falsa en memoria (solo para probar en la PC)
```

## Probar en la PC sin base de datos
Con un servidor local en la carpeta (por ejemplo `npx http-server -p 5520 -c-1`):
- `http://localhost:5520/?demo` → como admin.
- `http://localhost:5520/?demo=encargado` → como encargado de Central.

Los datos del modo demo son **inventados** y se pierden al recargar. El modo demo solo funciona en `localhost`; en el servidor la carpeta `pruebas/` está bloqueada.

## Pendientes
- Crear el proyecto de Supabase y seguir `SUPABASE-SETUP.md`.
- Cargar los empleados reales (desde la app, como admin).
- Crear el repo privado y desplegar (`GUIA-DESPLIEGUE.md`).
- Definir con Antonella si la exportación para liquidación necesita otro formato o columnas.

## Importar saldos de cuenta corriente (Descuentos de sueldo, solo admin)
- Se sube la planilla de saldos del sistema de gestión (siempre igual: N.º de cliente, nombre, Saldo Actual; .xls o .xlsx). La lee el navegador, no se sube a ningún servidor.
- Por cada empleado con saldo mayor a cero se deja **una compra en cuenta corriente** por el saldo actual (fecha de la planilla, tomada del nombre del archivo), pendiente de descontar. Reemplaza las compras pendientes que ya tuviera ese empleado; las ya descontadas no se tocan.
- Quien no es empleado, está dado de baja o tiene saldo cero **no se carga**. Antes de cargar se muestra todo para revisar, y avisa si la suma no coincide con el "Total General" de la planilla.
- Emparejamiento: por **N.º de cliente** (columna `empleados.codigo_cliente`, migración `20261031040000_codigo_cliente.sql`); la primera vez, por nombre (sin importar orden ni tildes) y se guarda el número. Si hay dudas (nombre parecido u homónimos), se elige a mano en pantalla.
- La librería de lectura (`js/lib/xlsx.full.min.js`, SheetJS 0.18.5) se baja solo al elegir un archivo.

- **Cuenta de horas → "Dejar todo en cero" (admin):** por cada empleado que debe horas (de todas las sucursales) registra una devolución por lo que debe, para reiniciar la cuenta. No borra nada: las deudas quedan en el historial.


## Limpieza del 2026-11-03
- Cuenta de horas en cero; vacaciones de períodos anteriores a 2026 borradas (novedades, liquidaciones y ajustes); planilla de asistencia eliminada (tablas, horas de salida y mínimos). La hora de **entrada** se conserva para las llegadas tarde. Migración `20261103000000_limpieza_viaje.sql`. El selector de período de vacaciones ya no ofrece años anteriores.

- **Feriados desde el calendario (admin):** al hacer clic en un día se abre el alta de evento y, debajo, el botón "Agregar feriado ese día" (pide un nombre: feriado, día no laborable, puente…). Queda como el resto de los feriados en toda la página. Si el día ya es feriado, el botón pasa a "Quitar feriado". Los encargados no lo ven.

- **Vacaciones en períodos sin vacaciones:** se pueden cargar como **excepción**. El formulario avisa que el período está prohibido y, al guardar, pide confirmar ("Cargar igual"); la base las acepta solo con esa confirmación (columna `novedades.excepcion_bloqueo`, migración `20261106000000_vacaciones_en_dias_prohibidos.sql`). En el calendario siguen rayados, y las vacaciones cargadas adentro se ven con el borde amarillo.

- **Horas por día (Novedades):** para horas extra, permiso de horas y devolución de horas ya no se pide hora de inicio y de fin: se anota **cuántas horas hizo ese día**. El botón **+ Agregar otro día** abre otro renglón con fecha (por defecto el día siguiente) y horas, y se guarda una novedad por día. En horas extra, cada día tiene su recargo, sugerido por la fecha (domingo y feriado 100

- **Color de fondo (Configuración → Color de fondo):** se elige entre ocho colores pastel (durazno de siempre, verde, menta, celeste, lila, rosa, amarillo, gris) o cualquier otro con el selector. Desde ese único color se calculan solos bordes, encabezados, fines de semana del calendario y textos (`js/color.js`); un color muy oscuro o muy claro se lleva a un pastel para que se lea bien. Es **personal**: se guarda en el navegador de quien lo elige (`localStorage`, clave `rrhh.color`) y no cambia lo que ven los demás. Como Configuración es solo para admin, solo ellos pueden cambiarlo.

- **Horas devueltas de más en la billetera:** si un empleado devolvió más horas de las que debía (la Cuenta de horas dice "a favor"), la ficha las suma al KPI "Billetera de horas" ("devueltas de más") y las muestra como primera fila del resumen de la billetera. Por ahora son solo informativas: se gastan con "Usar horas" únicamente las horas cargadas a la billetera (50% / 100%).
- **Sábados = 4 horas.** En la cuenta de horas, un día pedido vale la jornada del empleado (8 h si no tiene cargada) salvo los sábados, que valen 4 h (medio día). Si un permiso abarca varios días corridos, se cuentan los sábados del rango a 4 h; un día suelto de 0,5 vale la mitad. Vale para todo lo ya cargado: no hace falta tocar datos, el saldo se recalcula solo. Constante `JORNADA_SABADO` en `js/calculos.js`.
- **Horas extra compensadas:** en Horas extra, cada fila pendiente tiene el botón **Compensado** (y se pueden tildar varias y usar "Marcar como compensadas"): las horas salen de Pendientes de liquidar sin pagarse en ningún sueldo, porque ya se compensaron de otra forma. Quedan en la lista desplegable "Compensadas", con **Deshacer** para devolverlas a pendientes. Es la columna `compensado` de novedades (migración `20261108000000_horas_extra_compensadas.sql`: **correrla antes de desplegar** la página nueva).
- **Billetera de horas:** las horas a favor de cada empleado, en **dos saldos** (al 50% y al 100%, no se mezclan). Se cargan con **"Cargar horas a la billetera"** (o desde la ficha) y se gastan siempre con el mismo botón, **"Usar horas"**, eligiendo para qué: **cobrarlas en el sueldo** (pasan a Pendientes de liquidar con su recargo), **tiempo libre**, **cubrir horas que debe** (baja la deuda de la cuenta de horas) u **otro uso** (con detalle obligatorio). Se gastan primero las horas más viejas y cada uso queda como novedad "Uso de horas del banco". La ficha muestra el resumen de la billetera con el saldo después de cada movimiento. Técnicamente una carga es una novedad de horas extra con `banco = true` (`banco_usado` lleva lo ya usado); al cobrar, la carga queda toda usada y se crea una hora extra común pendiente por esas horas. Migración `20261107000000_banco_de_horas.sql`: **correrla antes de desplegar** la página nueva (si no, las listas de novedades fallan porque piden columnas que todavía no existen).

- **Novedades = solo lo que se liquida.** Los movimientos internos de horas (permisos de horas, días a devolver, devoluciones, y todo el banco de horas: depósitos y usos) ya no figuran en la lista de Novedades, ni en su filtro por tipo, ni en la exportación. Se cargan desde la **ficha del empleado** ("Registrar horas (movimiento interno)") o desde **Cuenta de horas**, y se ven en la ficha (tablas "Cuenta de horas" y "Billetera de horas"). Siguen guardándose en la misma tabla de la base, separados solo en lo que se muestra. "Cargar horas a la billetera" es un tipo del formulario interno; en el formulario de novedades las horas extra son siempre para liquidar.
- **Horas extra: editar filas.** En Pendientes de liquidar, cada fila tiene un botón **Editar**; en Liquidadas por mes, cada carga del detalle se puede abrir para corregirla (horas, fecha, recargo, empleado, observación, mes de liquidación) o eliminarla.
- **Ausencia en el calendario:** todo tipo marcado como "Ausencia" aparece en el calendario mientras dure (también los de horas, con la cantidad, por ejemplo "Prueba A. · Permiso de horas 2 h"). La columna "Ausencia" de Configuración → Tipos de novedad ahora se puede cambiar en cualquier tipo, incluidos los de fábrica (solo admin).
