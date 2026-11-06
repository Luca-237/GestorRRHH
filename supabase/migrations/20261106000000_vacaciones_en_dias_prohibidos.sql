-- =====================================================================
--  Vacaciones en períodos sin vacaciones: se pueden cargar como EXCEPCIÓN.
--  La página sigue avisando que el período está prohibido y pide confirmar;
--  si se confirma, marca la novedad con excepcion_bloqueo = true y la base
--  la deja pasar. Sin esa marca, la base sigue rechazándolas como antes.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.novedades add column if not exists excepcion_bloqueo boolean not null default false;

create or replace function public.controlar_periodo_sin_vacaciones()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  p record;
begin
  if not exists (select 1 from public.tipos_novedad t where t.clave = new.tipo and t.descuenta_vacaciones) then
    return new;
  end if;
  -- Cargada a propósito como excepción (la página pidió confirmación)
  if new.excepcion_bloqueo then
    return new;
  end if;
  -- Si solo cambia otra cosa (ej. se marca como liquidado), no se vuelve a controlar
  if tg_op = 'UPDATE' and new.empleado_id = old.empleado_id and new.tipo = old.tipo
     and new.fecha_desde = old.fecha_desde and new.fecha_hasta = old.fecha_hasta then
    return new;
  end if;
  select ps.fecha_desde, ps.fecha_hasta, ps.motivo into p
  from public.periodos_sin_vacaciones ps
  join public.empleados e on e.id = new.empleado_id
  where (ps.sucursal_id is null or ps.sucursal_id = e.sucursal_id)
    and ps.fecha_desde <= coalesce(new.fecha_hasta, new.fecha_desde)
    and ps.fecha_hasta >= new.fecha_desde
  order by ps.fecha_desde
  limit 1;
  if found then
    raise exception 'Período sin vacaciones: del % al % nadie puede tomarse vacaciones%.',
      to_char(p.fecha_desde, 'DD/MM/YYYY'), to_char(p.fecha_hasta, 'DD/MM/YYYY'),
      case when p.motivo <> '' then ' (' || p.motivo || ')' else '' end
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

commit;

-- Control
select count(*) filter (where excepcion_bloqueo) as vacaciones_cargadas_como_excepcion, count(*) as novedades from public.novedades;
