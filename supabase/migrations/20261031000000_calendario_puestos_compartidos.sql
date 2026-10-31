-- =====================================================================
--  Calendario: eventos con colores (inventario, capacitación, cierre…).
--  Puestos compartidos: grupos de empleados donde solo uno puede estar de
--  vacaciones a la vez. La base rechaza un goce que se superponga con el
--  de otro integrante del mismo grupo.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) Eventos del calendario
--    sucursal_id null = para todas las sucursales (lo carga un admin).
--    Un encargado carga y corrige los de su sucursal.
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id               bigint generated always as identity primary key,
  titulo           text not null check (length(trim(titulo)) > 0),
  descripcion      text not null default '',
  fecha_desde      date not null,
  fecha_hasta      date not null,
  color            text not null default '#e84e1b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sucursal_id      bigint references public.sucursales(id) on delete cascade,
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid() references auth.users(id) on delete set null,
  check (fecha_hasta >= fecha_desde)
);
create index if not exists eventos_fechas_idx on public.eventos (fecha_desde, fecha_hasta);

-- ---------------------------------------------------------------------
-- 2) Puestos compartidos (grupos de cobertura)
-- ---------------------------------------------------------------------
create table if not exists public.puestos_compartidos (
  id           bigint generated always as identity primary key,
  nombre       text not null unique check (length(trim(nombre)) > 0),
  descripcion  text not null default '',
  creado_en    timestamptz not null default now()
);

create table if not exists public.puestos_compartidos_miembros (
  puesto_compartido_id  bigint not null references public.puestos_compartidos(id) on delete cascade,
  empleado_id           bigint not null references public.empleados(id) on delete cascade,
  primary key (puesto_compartido_id, empleado_id)
);
create index if not exists pc_miembros_empleado_idx on public.puestos_compartidos_miembros (empleado_id);

-- Antes de guardar vacaciones: ¿otro integrante de un puesto compartido está de vacaciones esos días?
-- (security definer: tiene que ver a los compañeros aunque sean de otra sucursal)
create or replace function public.controlar_puesto_compartido()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  choque record;
begin
  if not exists (select 1 from public.tipos_novedad t where t.clave = new.tipo and t.descuenta_vacaciones) then
    return new;
  end if;
  -- Si solo cambia otra cosa (ej. se marca como liquidado), no se vuelve a controlar
  if tg_op = 'UPDATE' and new.empleado_id = old.empleado_id and new.tipo = old.tipo
     and new.fecha_desde = old.fecha_desde and new.fecha_hasta = old.fecha_hasta then
    return new;
  end if;
  select pc.nombre, e.apellido, e.nombre as nombre_emp, n.fecha_desde, n.fecha_hasta into choque
  from public.puestos_compartidos_miembros yo
  join public.puestos_compartidos pc on pc.id = yo.puesto_compartido_id
  join public.puestos_compartidos_miembros otro on otro.puesto_compartido_id = yo.puesto_compartido_id and otro.empleado_id <> yo.empleado_id
  join public.novedades n on n.empleado_id = otro.empleado_id
  join public.tipos_novedad t on t.clave = n.tipo and t.descuenta_vacaciones
  join public.empleados e on e.id = otro.empleado_id
  where yo.empleado_id = new.empleado_id
    and n.id is distinct from new.id
    and n.fecha_desde <= coalesce(new.fecha_hasta, new.fecha_desde)
    and n.fecha_hasta >= new.fecha_desde
  order by n.fecha_desde
  limit 1;
  if found then
    raise exception 'Puesto compartido "%": % % está de vacaciones del % al %. Solo uno puede estar de vacaciones a la vez.',
      choque.nombre, choque.nombre_emp, choque.apellido, to_char(choque.fecha_desde, 'DD/MM/YYYY'), to_char(choque.fecha_hasta, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Corre después de completar_novedad (los triggers "before" van en orden alfabético)
drop trigger if exists novedades_z_puesto_compartido on public.novedades;
create trigger novedades_z_puesto_compartido
  before insert or update on public.novedades
  for each row execute function public.controlar_puesto_compartido();

-- ---------------------------------------------------------------------
-- 3) Permisos
-- ---------------------------------------------------------------------
alter table public.eventos enable row level security;
alter table public.puestos_compartidos enable row level security;
alter table public.puestos_compartidos_miembros enable row level security;
revoke all on public.eventos, public.puestos_compartidos, public.puestos_compartidos_miembros from anon;
grant select, insert, update, delete on public.eventos, public.puestos_compartidos, public.puestos_compartidos_miembros to authenticated;
revoke truncate, references, trigger on public.eventos, public.puestos_compartidos, public.puestos_compartidos_miembros from authenticated;

-- Eventos: los de todas las sucursales los ven todos; los de una sucursal, quien ve esa sucursal
drop policy if exists eventos_select on public.eventos;
create policy eventos_select on public.eventos for select to authenticated
  using (public.es_usuario_activo() and (sucursal_id is null or public.puede_ver_sucursal(sucursal_id)));
drop policy if exists eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check (public.es_admin() or (sucursal_id is not null and public.puede_ver_sucursal(sucursal_id)));
drop policy if exists eventos_update on public.eventos;
create policy eventos_update on public.eventos for update to authenticated
  using (public.es_admin() or (sucursal_id is not null and public.puede_ver_sucursal(sucursal_id)))
  with check (public.es_admin() or (sucursal_id is not null and public.puede_ver_sucursal(sucursal_id)));
drop policy if exists eventos_delete on public.eventos;
create policy eventos_delete on public.eventos for delete to authenticated
  using (public.es_admin() or (sucursal_id is not null and public.puede_ver_sucursal(sucursal_id)));

-- Puestos compartidos: los ven todos los usuarios activos; los arma el admin
drop policy if exists pc_select on public.puestos_compartidos;
create policy pc_select on public.puestos_compartidos for select to authenticated using (public.es_usuario_activo());
drop policy if exists pc_insert on public.puestos_compartidos;
create policy pc_insert on public.puestos_compartidos for insert to authenticated with check (public.es_admin());
drop policy if exists pc_update on public.puestos_compartidos;
create policy pc_update on public.puestos_compartidos for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists pc_delete on public.puestos_compartidos;
create policy pc_delete on public.puestos_compartidos for delete to authenticated using (public.es_admin());

drop policy if exists pcm_select on public.puestos_compartidos_miembros;
create policy pcm_select on public.puestos_compartidos_miembros for select to authenticated using (public.puede_ver_empleado(empleado_id));
drop policy if exists pcm_insert on public.puestos_compartidos_miembros;
create policy pcm_insert on public.puestos_compartidos_miembros for insert to authenticated with check (public.es_admin());
drop policy if exists pcm_delete on public.puestos_compartidos_miembros;
create policy pcm_delete on public.puestos_compartidos_miembros for delete to authenticated using (public.es_admin());

commit;

-- Control
select (select count(*) from public.eventos) as eventos, (select count(*) from public.puestos_compartidos) as puestos_compartidos;
