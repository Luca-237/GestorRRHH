-- =====================================================================
--  Billetera de horas segura (decisiones de Luca, 11/11/2026):
--
--   1) "Usar horas" se hace en la base, en una sola transacción
--      (usar_billetera): o se guarda todo, o nada. Cada uso anota de qué
--      cargas salió (novedades.billetera_tomas) para poder deshacerlo.
--   2) Borrar un uso devuelve las horas a la billetera y borra lo que
--      generó (la hora extra a cobrar o la devolución de deuda). Si esas
--      horas ya se liquidaron en un sueldo, no se puede borrar.
--   3) Una carga de la que ya se usaron horas no se puede borrar, ni
--      bajarle la cantidad por debajo de lo usado, ni sacarla de la
--      billetera: primero se borran sus usos.
--   4) Borrar la hora extra pendiente que salió de "Cobrarlas en el sueldo"
--      devuelve esas horas a la billetera. Borrar la devolución que salió
--      de "Cubrir horas que debe" deshace el uso entero.
--   5) Solo un admin (RRHH) usa horas de la billetera o deshace usos.
--      Los encargados pueden seguir cargando horas a la billetera.
--
--  Correrla ANTES de desplegar la página nueva (la página llama a
--  usar_billetera). Hasta desplegar, "Usar horas" de la página vieja da error.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.novedades add column if not exists billetera_tomas jsonb;

-- Marca de "lo está haciendo la billetera" (solo dura la transacción)
create or replace function public.billetera_activa()
returns boolean
language sql stable
as $$ select coalesce(current_setting('rrhh.billetera', true), '') = '1' $$;

-- Horas con coma, para los mensajes
create or replace function public.billetera_horas_txt(h numeric)
returns text
language sql immutable
as $$ select replace(trim(trailing '.' from trim(trailing '0' from round(h, 2)::text)), '.', ',') || ' h' $$;

-- ---------------------------------------------------------------------
-- 1) Usar horas: todo en una transacción
-- ---------------------------------------------------------------------
create or replace function public.usar_billetera(
  p_empleado bigint, p_recargo int, p_horas numeric, p_destino text, p_fecha date default null, p_obs text default '')
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recargo int := case when p_recargo = 100 then 100 else 50 end;
  v_horas numeric := round(coalesce(p_horas, 0), 2);
  v_obs text := btrim(coalesce(p_obs, ''));
  v_fecha date := coalesce(p_fecha, current_date);
  v_disp numeric;
  v_falta numeric;
  v_toma numeric;
  v_uso bigint;
  v_he bigint;
  v_tomas jsonb := '[]'::jsonb;
  d record;
begin
  if not public.es_admin() then
    raise exception 'Solo RRHH (un usuario admin) puede usar horas de la billetera.';
  end if;
  if v_horas <= 0 then raise exception 'Indicá cuántas horas.'; end if;
  if p_destino is null or p_destino not in ('cobrar', 'libre', 'deuda', 'otro') then
    raise exception 'Destino no válido: %', p_destino;
  end if;
  if p_destino = 'otro' and v_obs = '' then raise exception 'Contá para qué se usan las horas.'; end if;

  perform set_config('rrhh.billetera', '1', true);

  -- Se bloquean las cargas del empleado para que dos usos a la vez no tomen las mismas horas
  perform 1 from public.novedades
   where empleado_id = p_empleado and tipo = 'horas_extra' and banco
   for update;
  select coalesce(sum(cantidad - banco_usado), 0) into v_disp from public.novedades
   where empleado_id = p_empleado and tipo = 'horas_extra' and banco
     and (case when recargo = 100 then 100 else 50 end) = v_recargo;
  if v_disp + 0.004 < v_horas then
    raise exception '%', format('Solo hay %s al %s%% en la billetera.', public.billetera_horas_txt(v_disp), v_recargo);
  end if;

  insert into public.novedades (empleado_id, tipo, fecha_desde, cantidad, observacion, billetera_tomas)
  values (p_empleado, 'banco_uso', v_fecha, v_horas,
          case p_destino when 'cobrar' then 'Cobro en el sueldo' when 'libre' then 'Tiempo libre'
                         when 'deuda' then 'Para cubrir horas que debe' else 'Otro uso' end
          || ' (horas al ' || v_recargo || '%)' || case when v_obs <> '' then ': ' || v_obs else '' end,
          '[]'::jsonb)
  returning id into v_uso;

  -- Se usan primero las horas más viejas
  v_falta := v_horas;
  for d in
    select id, cantidad, banco_usado, fecha_desde from public.novedades
     where empleado_id = p_empleado and tipo = 'horas_extra' and banco
       and (case when recargo = 100 then 100 else 50 end) = v_recargo
       and cantidad - banco_usado > 0.004
     order by fecha_desde, id
  loop
    exit when v_falta <= 0.004;
    v_toma := round(least(d.cantidad - d.banco_usado, v_falta), 2);
    update public.novedades set banco_usado = least(cantidad, banco_usado + v_toma) where id = d.id;
    v_he := null;
    if p_destino = 'cobrar' then
      -- Para cobrar, esas horas pasan a ser horas extra pendientes de liquidar (con su fecha y recargo)
      insert into public.novedades (empleado_id, tipo, fecha_desde, cantidad, recargo, banco, observacion, generada_por)
      values (p_empleado, 'horas_extra', d.fecha_desde, v_toma, v_recargo, false, 'Pasadas desde la billetera de horas', v_uso)
      returning id into v_he;
    end if;
    v_tomas := v_tomas || jsonb_build_object('deposito', d.id, 'horas', v_toma, 'hora_extra', v_he);
    v_falta := v_falta - v_toma;
  end loop;
  if v_falta > 0.004 then
    raise exception 'No alcanzan las horas de la billetera.';
  end if;

  update public.novedades set billetera_tomas = v_tomas where id = v_uso;

  -- Para cubrir lo que debe, también se registra la devolución (baja la deuda de la cuenta de horas)
  if p_destino = 'deuda' then
    insert into public.novedades (empleado_id, tipo, fecha_desde, cantidad, observacion, generada_por)
    values (p_empleado, 'devolucion_horas', v_fecha, v_horas, 'Cubierta con horas de la billetera', v_uso);
  end if;

  return v_uso;
end;
$$;

revoke execute on function public.usar_billetera(bigint, int, numeric, text, date, text) from anon, public;
grant execute on function public.usar_billetera(bigint, int, numeric, text, date, text) to authenticated;

-- ¿Esta fila salió de un uso de la billetera? (hora extra a cobrar o devolución de deuda)
create or replace function public.billetera_uso_de(p_id bigint)
returns bigint
language sql stable
as $$ select id from public.novedades where id = p_id and tipo = 'banco_uso' $$;

-- ---------------------------------------------------------------------
-- 2) Cambios que no se pueden hacer a mano (antes de guardar)
-- ---------------------------------------------------------------------
create or replace function public.controlar_billetera()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if public.billetera_activa() then return new; end if;
    if new.tipo = 'banco_uso' then
      raise exception 'Los usos de la billetera se registran con "Usar horas" (Cuenta de horas).';
    end if;
    new.billetera_tomas := null;
    new.banco_usado := 0;          -- una carga nueva arranca sin usar
    return new;
  end if;

  -- UPDATE
  if public.billetera_activa() then return new; end if;

  if old.tipo = 'banco_uso' or new.tipo = 'banco_uso' then
    if new.tipo is distinct from old.tipo or new.empleado_id is distinct from old.empleado_id
       or new.cantidad is distinct from old.cantidad or new.billetera_tomas is distinct from old.billetera_tomas then
      raise exception 'De un uso de la billetera solo se cambia la fecha o la observación. Para cambiar las horas, borralo (las horas vuelven a la billetera) y usalas de nuevo.';
    end if;
    return new;
  end if;

  if new.billetera_tomas is distinct from old.billetera_tomas then
    new.billetera_tomas := old.billetera_tomas;
  end if;
  if new.banco_usado is distinct from old.banco_usado then
    raise exception 'Las horas usadas de una carga solo cambian al usar horas o al borrar un uso.';
  end if;

  -- Carga de la que ya se usaron horas
  if old.tipo = 'horas_extra' and old.banco and old.banco_usado > 0.004 then
    if new.tipo is distinct from old.tipo or not new.banco or coalesce(new.compensado, false) then
      raise exception 'De esta carga ya se usaron %: no se puede sacar de la billetera. Borrá primero los usos que salieron de ella.', public.billetera_horas_txt(old.banco_usado);
    end if;
    if new.cantidad < old.banco_usado - 0.004 then
      raise exception 'De esta carga ya se usaron %: la cantidad no puede ser menor.', public.billetera_horas_txt(old.banco_usado);
    end if;
    if new.empleado_id is distinct from old.empleado_id
       or (case when new.recargo = 100 then 100 else 50 end) <> (case when old.recargo = 100 then 100 else 50 end) then
      raise exception 'De esta carga ya se usaron horas: no se puede cambiar el empleado ni el recargo. Borrá primero los usos que salieron de ella.';
    end if;
  end if;

  -- Hora extra que salió de "Cobrarlas en el sueldo"
  if old.tipo = 'horas_extra' and old.generada_por is not null and public.billetera_uso_de(old.generada_por) is not null then
    if new.tipo is distinct from old.tipo or new.empleado_id is distinct from old.empleado_id
       or new.cantidad is distinct from old.cantidad or new.recargo is distinct from old.recargo or new.banco then
      raise exception 'Estas horas salieron de la billetera. Para cambiarlas, borrá esta fila (las horas vuelven a la billetera) y usalas de nuevo.';
    end if;
  end if;
  return new;
end;
$$;

-- El nombre empieza con "a" para que corra antes que los demás (ve lo que mandó la página)
drop trigger if exists novedades_a_billetera on public.novedades;
create trigger novedades_a_billetera
  before insert or update on public.novedades
  for each row execute function public.controlar_billetera();

-- ---------------------------------------------------------------------
-- 3) Borrar: cargas usadas no; usos devuelven las horas
-- ---------------------------------------------------------------------
create or replace function public.borrar_en_billetera()
returns trigger
language plpgsql
as $$
declare
  t jsonb;
  v_liq date;
  v_falta numeric;
  v_toma numeric;
  v_rec int;
  d record;
begin
  -- Carga ya usada
  if old.tipo = 'horas_extra' and old.banco and old.banco_usado > 0.004 then
    raise exception 'De esta carga ya se usaron %. Borrá primero los usos que salieron de ella (ficha del empleado, Billetera de horas): las horas vuelven y después se puede borrar.', public.billetera_horas_txt(old.banco_usado);
  end if;

  if old.tipo <> 'banco_uso' then return old; end if;

  -- Uso: las horas vuelven a la billetera y lo que generó se borra solo (generada_por en cascada)
  if not public.es_admin() then
    raise exception 'Solo RRHH (un usuario admin) puede borrar usos de la billetera.';
  end if;
  select min(liquidado_en) into v_liq from public.novedades
   where generada_por = old.id and tipo = 'horas_extra' and liquidado_en is not null;
  if v_liq is not null then
    raise exception 'Las horas de este uso ya se liquidaron en el sueldo de %: no se puede borrar.', to_char(v_liq, 'MM/YYYY');
  end if;

  perform set_config('rrhh.billetera', '1', true);
  if old.billetera_tomas is not null then
    for t in select value from jsonb_array_elements(old.billetera_tomas) loop
      update public.novedades set banco_usado = greatest(0, banco_usado - (t->>'horas')::numeric)
       where id = (t->>'deposito')::bigint;
    end loop;
  else
    -- Uso cargado antes del 11/11/2026: no guarda de qué cargas salió ni lo que generó
    if old.observacion ilike 'Cobro en el sueldo%' or old.observacion ilike 'Para cubrir horas que debe%' then
      raise exception 'Este uso se cargó antes del arreglo del 11/11 y no guarda lo que generó (la hora extra a cobrar o la devolución). Para deshacerlo hay que corregirlo a mano: avisale a Luca.';
    end if;
    v_rec := case when old.observacion ~ 'al 100%' then 100 else 50 end;
    v_falta := old.cantidad;
    for d in
      select id, banco_usado from public.novedades
       where empleado_id = old.empleado_id and tipo = 'horas_extra' and banco and banco_usado > 0
         and (case when recargo = 100 then 100 else 50 end) = v_rec
       order by fecha_desde desc, id desc
    loop
      exit when v_falta <= 0.004;
      v_toma := least(d.banco_usado, v_falta);
      update public.novedades set banco_usado = banco_usado - v_toma where id = d.id;
      v_falta := v_falta - v_toma;
    end loop;
  end if;
  return old;
end;
$$;

drop trigger if exists novedades_a_billetera_borrar on public.novedades;
create trigger novedades_a_billetera_borrar
  before delete on public.novedades
  for each row execute function public.borrar_en_billetera();

-- Después de borrar lo que generó un uso: la hora extra a cobrar vuelve a la billetera;
-- la devolución de deuda deshace el uso entero
create or replace function public.devolver_a_billetera()
returns trigger
language plpgsql
as $$
declare
  u record;
  t jsonb;
  quedan jsonb := '[]'::jsonb;
  v_h numeric := 0;
begin
  if old.generada_por is null or old.tipo not in ('horas_extra', 'devolucion_horas') then return null; end if;
  select * into u from public.novedades where id = old.generada_por and tipo = 'banco_uso';
  if not found then return null; end if;      -- se está borrando el uso entero: ya devolvió las horas

  if not public.es_admin() then
    raise exception 'Solo RRHH (un usuario admin) puede deshacer un uso de la billetera.';
  end if;
  if old.tipo = 'horas_extra' and old.liquidado_en is not null then
    raise exception 'Estas horas ya se liquidaron en el sueldo de %: no vuelven a la billetera.', to_char(old.liquidado_en, 'MM/YYYY');
  end if;

  perform set_config('rrhh.billetera', '1', true);
  if old.tipo = 'devolucion_horas' then
    -- Sin la devolución, el uso no tiene sentido: se deshace entero
    delete from public.novedades where id = u.id;
    return null;
  end if;

  for t in select value from jsonb_array_elements(coalesce(u.billetera_tomas, '[]'::jsonb)) loop
    if (t->>'hora_extra')::bigint = old.id then
      update public.novedades set banco_usado = greatest(0, banco_usado - (t->>'horas')::numeric)
       where id = (t->>'deposito')::bigint;
      v_h := v_h + (t->>'horas')::numeric;
    else
      quedan := quedan || t;
    end if;
  end loop;

  if jsonb_array_length(quedan) = 0 then
    -- No quedó nada de ese uso: se borra (sin volver a devolver horas)
    update public.novedades set billetera_tomas = '[]'::jsonb, cantidad = 0 where id = u.id;
    delete from public.novedades where id = u.id;
  else
    update public.novedades set billetera_tomas = quedan, cantidad = greatest(0, cantidad - v_h) where id = u.id;
  end if;
  return null;
end;
$$;

drop trigger if exists novedades_z_devolver_billetera on public.novedades;
create trigger novedades_z_devolver_billetera
  after delete on public.novedades
  for each row execute function public.devolver_a_billetera();

commit;

-- Control
select (select count(*) from public.novedades where tipo = 'banco_uso') as usos_de_la_billetera,
       (select count(*) from public.novedades where tipo = 'banco_uso' and billetera_tomas is null) as usos_anteriores_al_arreglo,
       (select count(*) from public.novedades where tipo = 'horas_extra' and banco and banco_usado > 0) as cargas_con_horas_usadas;
