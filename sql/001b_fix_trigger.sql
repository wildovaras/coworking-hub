-- ============================================================
-- PATCH 001b · Arregla bug del trigger BEFORE INSERT (FK violation)
-- Corre esto en Supabase SQL Editor DESPUÉS de haber corrido 001.
-- Idempotente. No borra datos.
-- ============================================================

-- 1) Drop del trigger viejo (era BEFORE INSERT OR UPDATE — rompía la FK)
drop trigger if exists trg_log_puesto_evento on puestos;

-- 2) Función BEFORE UPDATE: solo muta timestamps cuando cambia el estado.
create or replace function fn_puesto_before_update() returns trigger
language plpgsql as $$
begin
  if (NEW.estado is distinct from OLD.estado) then
    NEW.estado_desde := now();
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_puesto_before_update on puestos;
create trigger trg_puesto_before_update
  before update on puestos
  for each row execute function fn_puesto_before_update();

-- 3) Función AFTER INSERT OR UPDATE: registra el evento.
-- Ahora ya existe el row en puestos cuando esto corre → FK válida.
create or replace function fn_log_puesto_evento() returns trigger
language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    insert into puestos_eventos(puesto_id, estado_de, estado_a, miembro_id, reserva_id, actor)
    values (NEW.id, null, NEW.estado, NEW.miembro_id, NEW.reserva_id, 'sistema');
  elsif (TG_OP = 'UPDATE' and NEW.estado is distinct from OLD.estado) then
    insert into puestos_eventos(puesto_id, estado_de, estado_a, miembro_id, reserva_id, actor)
    values (NEW.id, OLD.estado, NEW.estado, NEW.miembro_id, NEW.reserva_id,
            coalesce(current_setting('app.actor', true), 'sistema'));
  end if;
  return null;  -- AFTER trigger: no se usa el return
end;
$$;

drop trigger if exists trg_log_puesto_evento on puestos;
create trigger trg_log_puesto_evento
  after insert or update on puestos
  for each row execute function fn_log_puesto_evento();

-- 4) Ahora SÍ podemos correr el seed (idempotente, no duplica).
insert into puestos (codigo, tipo, centro, nombre) values
  ('HD-01','hot_desk','planta_abierta','Hot Desk 01 — Ventana norte'),
  ('HD-02','hot_desk','planta_abierta','Hot Desk 02 — Ventana norte'),
  ('HD-03','hot_desk','planta_abierta','Hot Desk 03 — Central'),
  ('HD-04','hot_desk','planta_abierta','Hot Desk 04 — Central'),
  ('HD-05','hot_desk','planta_abierta','Hot Desk 05 — Pasillo'),
  ('HD-06','hot_desk','planta_abierta','Hot Desk 06 — Pasillo'),
  ('ED-01','dedicado','dedicados','Escritorio Dedicado 01'),
  ('ED-02','dedicado','dedicados','Escritorio Dedicado 02'),
  ('SR-A','sala','salas','Sala Aysén (8 personas)'),
  ('SR-B','sala','salas','Sala Bío-Bío (4 personas)'),
  ('PB-1','booth','booths','Phone Booth 1'),
  ('PB-2','booth','booths','Phone Booth 2')
on conflict (codigo) do nothing;

-- 5) Vista (idempotente).
create or replace view v_puestos_live as
select
  p.id, p.codigo, p.tipo, p.centro, p.nombre, p.estado, p.estado_desde, p.notas,
  extract(epoch from (now() - p.estado_desde))::int as segundos_en_estado,
  p.miembro_id,
  m.nombre as miembro_nombre,
  p.reserva_id
from puestos p
left join miembros m on m.id = p.miembro_id
order by p.centro, p.codigo;

-- 6) Verifica:
--   select codigo, tipo, estado from puestos order by codigo;       -- debe dar 12 filas
--   select count(*) from puestos_eventos;                            -- debe dar 12 (1 evento INSERT por puesto)
--   select * from v_puestos_live;
