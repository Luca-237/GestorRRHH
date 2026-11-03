-- =====================================================================
--  BORRA TODAS LAS NOVEDADES (vacaciones, francos, licencias, faltas,
--  llegadas tarde, horas extra, adelantos, compras en cuenta corriente,
--  permisos y devoluciones de horas, viajes, etc.). NO SE PUEDE DESHACER.
--
--  No toca: empleados, sucursales, puestos, tipos de novedad, feriados,
--  períodos sin vacaciones, puestos compartidos, eventos del calendario,
--  ni las liquidaciones y ajustes de vacaciones del 2026 (esos no son novedades).
--  Con esto, la cuenta de horas, lo pendiente de liquidar y lo pendiente de
--  descontar quedan en cero.
--  Se puede volver a correr: sin novedades, no hace nada.
-- =====================================================================
begin;

delete from public.novedades;

commit;

-- Control: todo en 0
select
  (select count(*) from public.novedades)               as novedades_que_quedan,
  (select count(*) from public.empleados)               as empleados_intactos,
  (select count(*) from public.vacaciones_liquidaciones) as liquidaciones_de_vacaciones,
  (select count(*) from public.vacaciones_ajustes)       as ajustes_de_vacaciones;
