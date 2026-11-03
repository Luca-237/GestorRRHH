-- =====================================================================
--  Limpieza de datos y novedad "Viaje".
--
--   1) Novedad nueva "Viaje": cuando mandan a un empleado a una localidad
--      cercana. Cuenta como ausencia del local (aparece en el calendario y en
--      "hoy no están") pero NO descuenta vacaciones.
--   2) Cuenta de horas en cero: por cada empleado que debe horas se registra
--      una devolución por lo que debe (no se borra nada del historial).
--   3) Vacaciones de períodos anteriores a 2026 (el 2026 va de oct 2026 a abr 2027):
--      se BORRAN las vacaciones cargadas, sus liquidaciones y sus ajustes.
--      ESTO NO SE PUEDE DESHACER.
--   4) Se elimina la planilla de asistencia: tabla de asistencia, ajustes de
--      horarios y las horas de salida / mínimos propios de empleados y sucursales.
--      (La hora de ENTRADA de empleados y sucursales se conserva: la usan las
--      llegadas tarde de Novedades.)
--
--  Correr DESPUÉS de desplegar la versión nueva de la página (que ya no usa la
--  planilla de asistencia). Se puede volver a correr: no repite nada.
-- =====================================================================
begin;

-- 1) Viaje
insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas, descuenta_sueldo) values
  ('viaje', 'Viaje (enviado a otra localidad)', 'dias', false, true, '#1f5f8b', 13, false, 0, false)
on conflict (clave) do nothing;

-- 2) Cuenta de horas en cero (mismo cálculo que la página: días × jornada del empleado, 8 h si no tiene)
insert into public.novedades (empleado_id, tipo, fecha_desde, fecha_hasta, cantidad, observacion)
select s.empleado_id, 'devolucion_horas', current_date, current_date, round(s.saldo::numeric, 2),
       'Reinicio de la cuenta de horas: se saldan todas las deudas'
from (
  select n.empleado_id,
         sum(t.cuenta_horas * case t.unidad when 'horas' then n.cantidad
                                            when 'minutos' then n.cantidad / 60.0
                                            else n.cantidad * coalesce(e.jornada_horas, 8) end) as saldo
  from public.novedades n
  join public.tipos_novedad t on t.clave = n.tipo and t.cuenta_horas <> 0
  join public.empleados e on e.id = n.empleado_id
  group by n.empleado_id
) s
where s.saldo > 0.005;

-- 3) Vacaciones de períodos anteriores a 2026
delete from public.novedades where anio_vacaciones is not null and anio_vacaciones < 2026;
delete from public.vacaciones_liquidaciones where anio < 2026;
delete from public.vacaciones_ajustes where anio < 2026;

-- 4) Fuera la planilla de asistencia
drop table if exists public.asistencia;
drop table if exists public.ajustes_horarios;
alter table public.empleados
  drop column if exists hora_salida,
  drop column if exists extra_entrada_min,
  drop column if exists extra_salida_min;
alter table public.sucursales drop column if exists hora_salida;

commit;

-- Control
select
  (select count(*) from public.tipos_novedad where clave = 'viaje')                                  as tipo_viaje,
  (select count(*) from public.novedades where anio_vacaciones < 2026)                                as vacaciones_viejas_que_quedan,
  (select count(*) from public.vacaciones_liquidaciones where anio < 2026)                            as liquidaciones_viejas_que_quedan,
  (select count(*) from public.vacaciones_ajustes where anio < 2026)                                  as ajustes_viejos_que_quedan,
  (select coalesce(max(abs(x.saldo)), 0) from (
     select sum(t.cuenta_horas * case t.unidad when 'horas' then n.cantidad when 'minutos' then n.cantidad / 60.0
                                               else n.cantidad * coalesce(e.jornada_horas, 8) end) as saldo
     from public.novedades n
     join public.tipos_novedad t on t.clave = n.tipo and t.cuenta_horas <> 0
     join public.empleados e on e.id = n.empleado_id group by n.empleado_id) x)                       as mayor_saldo_de_horas_restante,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'asistencia') as tabla_asistencia_existe;
