-- =====================================================================
--  Períodos sin vacaciones: fechas en las que nadie puede tomarse
--  vacaciones (temporada alta). sucursal_id null = todas las sucursales.
--  La base rechaza un goce que toque uno de estos períodos.
--  Incluye la carga del "Calendario vacaciones temporada 2026"
--  (01/10/2026 a 30/09/2027): períodos tachados, feriados y fechas comerciales.
--  Se puede volver a correr: no duplica.
-- =====================================================================
begin;

create table if not exists public.periodos_sin_vacaciones (
  id           bigint generated always as identity primary key,
  fecha_desde  date not null,
  fecha_hasta  date not null,
  motivo       text not null default '',
  sucursal_id  bigint references public.sucursales(id) on delete cascade,
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid() references auth.users(id) on delete set null,
  check (fecha_hasta >= fecha_desde)
);
create index if not exists psv_fechas_idx on public.periodos_sin_vacaciones (fecha_desde, fecha_hasta);

-- Antes de guardar vacaciones: ¿tocan un período bloqueado (general o de su sucursal)?
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

-- Corre después de completar_novedad (los "before" van en orden alfabético)
drop trigger if exists novedades_y_periodo_sin_vacaciones on public.novedades;
create trigger novedades_y_periodo_sin_vacaciones
  before insert or update on public.novedades
  for each row execute function public.controlar_periodo_sin_vacaciones();

alter table public.periodos_sin_vacaciones enable row level security;
revoke all on public.periodos_sin_vacaciones from anon;
grant select, insert, update, delete on public.periodos_sin_vacaciones to authenticated;
revoke truncate, references, trigger on public.periodos_sin_vacaciones from authenticated;
drop policy if exists psv_select on public.periodos_sin_vacaciones;
create policy psv_select on public.periodos_sin_vacaciones for select to authenticated
  using (public.es_usuario_activo() and (sucursal_id is null or public.puede_ver_sucursal(sucursal_id)));
drop policy if exists psv_insert on public.periodos_sin_vacaciones;
create policy psv_insert on public.periodos_sin_vacaciones for insert to authenticated with check (public.es_admin());
drop policy if exists psv_update on public.periodos_sin_vacaciones;
create policy psv_update on public.periodos_sin_vacaciones for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists psv_delete on public.periodos_sin_vacaciones;
create policy psv_delete on public.periodos_sin_vacaciones for delete to authenticated using (public.es_admin());

-- ---------------------------------------------------------------------
-- Carga: "Calendario vacaciones temporada 2026" (01/10/2026 a 30/09/2027)
-- ---------------------------------------------------------------------
insert into public.periodos_sin_vacaciones (fecha_desde, fecha_hasta, motivo)
select v.d::date, v.h::date, 'Calendario de vacaciones temporada 2026'
from (values
  ('2026-10-01', '2026-10-18'),
  ('2026-11-16', '2026-12-20'),
  ('2027-01-04', '2027-02-28'),
  ('2027-07-26', '2027-07-31'),
  ('2027-08-02', '2027-08-15'),
  ('2027-09-20', '2027-09-30')
) v(d, h)
where not exists (select 1 from public.periodos_sin_vacaciones p where p.fecha_desde = v.d::date and p.fecha_hasta = v.h::date and p.sucursal_id is null);

insert into public.feriados (fecha, descripcion) values
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural'),
  ('2026-11-23', 'Día de la Soberanía Nacional'),
  ('2026-12-08', 'Día de la Inmaculada Concepción de María'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-02-08', 'Carnaval'),
  ('2027-02-09', 'Carnaval'),
  ('2027-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('2027-05-01', 'Día del Trabajador'),
  ('2027-05-25', 'Día de la Revolución de Mayo'),
  ('2027-06-17', 'Paso a la Inmortalidad del General Martín Güemes'),
  ('2027-07-09', 'Día de la Independencia'),
  ('2027-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín')
on conflict (fecha) do nothing;

-- Fechas comerciales (resaltadas en amarillo en el calendario)
insert into public.eventos (titulo, descripcion, fecha_desde, fecha_hasta, color)
select v.t, 'Fecha comercial (calendario de vacaciones temporada 2026)', v.d::date, v.d::date, '#d4a017'
from (values ('Día de la Madre', '2026-10-18'), ('Día del Padre', '2027-06-20'), ('Día del Niño', '2027-08-15')) v(t, d)
where not exists (select 1 from public.eventos e where e.titulo = v.t and e.fecha_desde = v.d::date);

commit;

-- Control: períodos cargados y vacaciones ya cargadas que caen dentro (se cargaron antes de bloquear)
select to_char(p.fecha_desde, 'DD/MM/YYYY') || ' al ' || to_char(p.fecha_hasta, 'DD/MM/YYYY') as periodo_sin_vacaciones,
       coalesce(string_agg(e.apellido || ' ' || to_char(n.fecha_desde, 'DD/MM') || '–' || to_char(n.fecha_hasta, 'DD/MM'), ', '), '—') as vacaciones_ya_cargadas_adentro
from public.periodos_sin_vacaciones p
left join public.novedades n on n.tipo = 'vacaciones' and n.fecha_desde <= p.fecha_hasta and n.fecha_hasta >= p.fecha_desde
left join public.empleados e on e.id = n.empleado_id
group by p.fecha_desde, p.fecha_hasta order by p.fecha_desde;
