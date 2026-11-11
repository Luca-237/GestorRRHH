-- =====================================================================
--  Calendario: qué se muestra y qué se oculta.
--
--   1) tipos_novedad.en_calendario: el tipo aparece en el calendario aunque
--      no sea una ausencia (por ejemplo "Trabajó un feriado"). Las ausencias
--      se siguen mostrando siempre.
--   2) novedades.oculto_calendario y eventos.oculto_calendario: ocultar del
--      calendario una novedad o un evento puntual (el switch "Mostrar en el
--      calendario" de su detalle). No se borra nada: se vuelven a ver con el
--      filtro "Ocultos".
--
--  Correrla ANTES de desplegar la página nueva (la página pide estas columnas).
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.tipos_novedad add column if not exists en_calendario boolean not null default false;
alter table public.novedades     add column if not exists oculto_calendario boolean not null default false;
alter table public.eventos       add column if not exists oculto_calendario boolean not null default false;

-- "Trabajó un feriado" (por si todavía no se corrió su migración) y que se vea en el calendario
insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas, descuenta_sueldo) values
  ('trabajo_feriado', 'Trabajó un feriado', 'registro', false, false, '#b8860b', 16, false, 0, false)
on conflict (clave) do nothing;
update public.tipos_novedad set en_calendario = true where clave = 'trabajo_feriado';

commit;

-- Control
select (select string_agg(nombre, ', ') from public.tipos_novedad where en_calendario) as tipos_en_calendario_sin_ser_ausencia,
       (select count(*) from public.novedades where oculto_calendario) as novedades_ocultas,
       (select count(*) from public.eventos where oculto_calendario)   as eventos_ocultos;
