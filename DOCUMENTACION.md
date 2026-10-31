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
- **Asistencia:** planilla por día con la hora de entrada y de salida de cada empleado; calcula solos los minutos de llegada tarde y los minutos a favor (llegar al menos 30 min antes de la entrada, o irse 10 min o más después de la salida; los mínimos y el modo "todos los minutos / solo el excedente" se cambian en Configuración, y por empleado en su ficha). Incluye resumen del mes. Los horarios salen del empleado, si no de su sucursal.
- **Calendario:** rectángulos redondeados de color por ausencia o evento, como Google Calendar (en celular, lista por día).
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
- **Período vacacional:** lo que se toma de enero a abril se descuenta, por defecto, del período del año anterior (se puede elegir otro al cargar).
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
