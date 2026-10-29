# Gestor de RRHH — Cindy Mayorista

Página para controlar al personal de todas las sucursales: vacaciones, francos, llegadas tarde, horas extra, licencias médicas, otras licencias y evaluaciones de desempeño, con un tablero por sucursal.

## Stack
- **Front:** HTML + CSS + JavaScript sin frameworks, estilo Cindy (mismos tokens que el generador de rótulos).
- **Back:** Supabase (Postgres + login + permisos RLS + una Edge Function para administrar usuarios).
- **Hosting:** Ferozo, archivos estáticos. Sin servidor Node ni `.env` (no hay SSH).
- **Node.js** solo en la PC, para probar (servidor local y pruebas de la base).

## Roles
| Rol | Ve | Puede |
|---|---|---|
| **Admin** | Todas las sucursales | Todo: empleados, novedades, ajustes de vacaciones, evaluaciones, usuarios, sucursales, tipos de novedad y criterios |
| **Encargado** | Solo su sucursal | Cargar y corregir novedades y evaluaciones de su gente. No da de alta empleados ni ve Configuración |

Los permisos los aplica la **base** (RLS), no la página: aunque alguien modifique el JavaScript, no puede leer ni cambiar lo que no le corresponde.

## Secciones
- **Tablero:** indicadores del mes (activos, quién falta hoy, llegadas tarde, horas extra, licencias, faltas, evaluación promedio), próximas ausencias, resumen por sucursal y por empleado. Clic en un empleado → ficha.
- **Empleados:** lista con búsqueda; alta y edición (admin). Solo datos laborales: **los datos de salud y de emergencia no van en este sistema.**
- **Novedades:** lista por mes, tipo y empleado; carga y corrección; **Exportar para liquidación** (CSV para Excel con una fila por empleado y los totales del mes, para el estudio contable).
- **Vacaciones:** días que corresponden por antigüedad (LCT art. 150), tomados, ajustes y saldo por período.
- **Evaluaciones:** 1 a 5 por criterio, fortalezas y aspectos a mejorar; última evaluación de cada uno e historial.
- **Cuenta de horas:** cuenta corriente de las horas que debe cada empleado. Suman a la deuda los permisos de horas y los días pedidos a devolver; la descuentan las devoluciones (horas trabajadas de más para compensar). Muestra saldo por empleado (debe / a favor), todos los movimientos y, en la ficha, el resumen con el saldo después de cada movimiento. Los días se pasan a horas con la jornada del empleado (8 si no tiene). El tablero suma "Horas adeudadas" y la exportación para liquidación trae el saldo de cada uno.
  - Qué tipos mueven la cuenta se elige en **Configuración → Tipos de novedad → Cuenta de horas** (ej. se puede hacer que las llegadas tarde se devuelvan). Por defecto solo mueven la cuenta los tres tipos nuevos.
- **Configuración (admin):** usuarios, sucursales, **puestos**, tipos de novedad (se pueden agregar más) y criterios de evaluación.
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
