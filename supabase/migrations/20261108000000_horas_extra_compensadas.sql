-- =====================================================================
--  Horas extra "compensadas": horas extra que no se liquidan porque ya se
--  compensaron de otra forma (por ejemplo con tiempo libre). Salen de
--  "Pendientes de liquidar" sin pasar por ningún sueldo. Se puede deshacer.
--
--  · compensado = true solo vale para horas extra.
--  · Una hora compensada no está liquidada, ni en el banco de horas.
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.novedades add column if not exists compensado boolean not null default false;

create or replace function public.controlar_compensado()
returns trigger
language plpgsql
as $$
begin
  if new.tipo <> 'horas_extra' then
    new.compensado := false;
  end if;
  if new.compensado then
    new.liquidado_en := null;
    new.banco := false;
    new.banco_usado := 0;
  end if;
  return new;
end;
$$;

-- El nombre empieza con "z" para que corra después del trigger del banco
drop trigger if exists novedades_z_compensado on public.novedades;
create trigger novedades_z_compensado
  before insert or update on public.novedades
  for each row execute function public.controlar_compensado();

commit;

-- Control
select count(*) filter (where compensado) as horas_extra_compensadas from public.novedades;
