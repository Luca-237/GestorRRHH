-- =====================================================================
--  Hora de entrada por sucursal y minutos de llegada tarde calculados
--  por la base a partir de la hora de llegada.
--   · Cada sucursal tiene su hora de entrada (09:00 por defecto).
--   · Si el empleado tiene la suya, manda la del empleado.
--   · Al cambiar cualquiera de las dos, se recalculan sus llegadas tarde.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.sucursales add column if not exists hora_entrada time not null default '09:00';

-- Minutos tarde de un empleado que llegó a "p_hora"
create or replace function public.minutos_tarde(p_empleado bigint, p_hora time)
returns numeric
language sql stable security definer set search_path = public
as $$
  select greatest(0, round(extract(epoch from (p_hora - coalesce(e.hora_entrada, s.hora_entrada, '09:00'::time))) / 60))
  from public.empleados e left join public.sucursales s on s.id = e.sucursal_id
  where e.id = p_empleado;
$$;
revoke execute on function public.minutos_tarde(bigint, time) from anon, public;
grant execute on function public.minutos_tarde(bigint, time) to authenticated;

create or replace function public.completar_novedad()
returns trigger
language plpgsql
as $$
declare
  t public.tipos_novedad;
begin
  select * into t from public.tipos_novedad where clave = new.tipo;
  if new.fecha_hasta is null then new.fecha_hasta := new.fecha_desde; end if;
  if t.unidad = 'dias' then
    new.cantidad := (new.fecha_hasta - new.fecha_desde) + 1;
  else
    -- Minutos, horas, pesos o registro: es un solo día
    new.fecha_hasta := new.fecha_desde;
    if t.unidad = 'registro' then new.cantidad := 0; end if;
  end if;
  -- Llegada tarde con hora: los minutos salen de la hora de entrada (empleado o sucursal)
  if new.tipo = 'llegada_tarde' and new.hora is not null then
    new.cantidad := coalesce(public.minutos_tarde(new.empleado_id, new.hora), new.cantidad);
  end if;
  if t.descuenta_vacaciones then
    -- Período vacacional (LCT): del 1/10 al 30/4. Lo tomado de enero a abril
    -- corresponde por defecto al año anterior. Se puede indicar a mano.
    if new.anio_vacaciones is null then
      new.anio_vacaciones := extract(year from new.fecha_desde)::int
                             - case when extract(month from new.fecha_desde) <= 4 then 1 else 0 end;
    end if;
  else
    new.anio_vacaciones := null;
  end if;
  if new.tipo <> 'horas_extra' then new.recargo := null; end if;
  if new.tipo not in ('horas_extra', 'llegada_tarde') then new.hora := null; end if;
  if new.tipo <> 'horas_extra' and not coalesce(t.descuenta_vacaciones, false) then new.liquidado_en := null; end if;
  return new;
end;
$$;

-- Al cambiar la hora de entrada, recalcular las llegadas tarde que tienen hora
create or replace function public.recalcular_llegadas_empleado()
returns trigger
language plpgsql
as $$
begin
  update public.novedades set hora = hora
  where empleado_id = new.id and tipo = 'llegada_tarde' and hora is not null;
  return null;
end;
$$;

drop trigger if exists empleados_recalcular_llegadas on public.empleados;
create trigger empleados_recalcular_llegadas
  after update of hora_entrada, sucursal_id on public.empleados
  for each row execute function public.recalcular_llegadas_empleado();

create or replace function public.recalcular_llegadas_sucursal()
returns trigger
language plpgsql
as $$
begin
  update public.novedades n set hora = n.hora
  from public.empleados e
  where e.id = n.empleado_id and e.sucursal_id = new.id and e.hora_entrada is null
    and n.tipo = 'llegada_tarde' and n.hora is not null;
  return null;
end;
$$;

drop trigger if exists sucursales_recalcular_llegadas on public.sucursales;
create trigger sucursales_recalcular_llegadas
  after update of hora_entrada on public.sucursales
  for each row execute function public.recalcular_llegadas_sucursal();

-- Recalcular las que ya están cargadas (con la regla nueva)
update public.novedades set hora = hora where tipo = 'llegada_tarde' and hora is not null;

commit;

-- Control: hora de entrada de cada sucursal
select nombre, hora_entrada from public.sucursales order by orden, nombre;
