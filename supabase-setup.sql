-- LQ Hub: Pixel Floor Chart for GitHub Pages + Supabase
-- Run once in Supabase Dashboard -> SQL Editor.
-- Public read and public named publish are enabled. Names are self-reported.

create table if not exists public.floor_state (
    id integer primary key check (id = 1),
    tiles jsonb not null,
    version bigint not null default 0,
    updated_at timestamptz not null default now()
);

create table if not exists public.floor_updates (
    id bigint generated always as identity primary key,
    author text not null,
    created_at timestamptz not null default now(),
    changes jsonb not null
);

insert into public.floor_state (id, tiles)
select 1,
       jsonb_object_agg(chr(65 + c) || r::text, 'healthy')
from generate_series(0, 14) as c,
     generate_series(1, 18) as r
on conflict (id) do nothing;

alter table public.floor_state enable row level security;
alter table public.floor_updates enable row level security;

drop policy if exists "floor_public_read" on public.floor_state;
create policy "floor_public_read" on public.floor_state
    for select to anon, authenticated using (true);

drop policy if exists "history_public_read" on public.floor_updates;
create policy "history_public_read" on public.floor_updates
    for select to anon, authenticated using (true);

revoke all on public.floor_state from anon, authenticated;
revoke all on public.floor_updates from anon, authenticated;
grant select on public.floor_state to anon, authenticated;
grant select on public.floor_updates to anon, authenticated;

create or replace function public.publish_floor_update(
    p_name text,
    p_changes jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_tiles jsonb;
    v_change jsonb;
    v_id text;
    v_from text;
    v_to text;
    v_actual text;
    v_seen text[] := array[]::text[];
    v_applied jsonb := '[]'::jsonb;
    v_version bigint;
    v_statuses text[] := array[
        'healthy', 'poor', 'replace', 'replaced',
        'multiple', 'replaced-poor', 'replaced-replace'
    ];
begin
    if p_name is null or length(btrim(p_name)) < 2 or length(p_name) > 70 then
        raise exception 'Enter a name between 2 and 70 characters.';
    end if;

    if p_changes is null or jsonb_typeof(p_changes) <> 'array'
       or jsonb_array_length(p_changes) < 1 or jsonb_array_length(p_changes) > 270 then
        raise exception 'Submit between 1 and 270 changed tiles.';
    end if;

    select tiles, version into v_tiles, v_version
    from public.floor_state where id = 1 for update;
    if v_tiles is null then
        raise exception 'Floor data is not initialised.';
    end if;

    for v_change in select value from jsonb_array_elements(p_changes) loop
        if jsonb_typeof(v_change) <> 'object' then
            raise exception 'Invalid tile change.';
        end if;
        v_id := v_change->>'tile';
        v_from := v_change->>'from';
        v_to := v_change->>'status';

        if v_id is null or v_id !~ '^[A-O]([1-9]|1[0-8])$'
           or v_id = any(v_seen) then
            raise exception 'Invalid or duplicated tile.';
        end if;
        v_seen := array_append(v_seen, v_id);

        if v_from is null or not(v_from = any(v_statuses))
           or v_to is null or not(v_to = any(v_statuses)) then
            raise exception 'Invalid tile status.';
        end if;

        v_actual := v_tiles->>v_id;
        if v_actual is distinct from v_from then
            raise exception 'FLOOR_CONFLICT: tile % changed since you loaded the floor', v_id;
        end if;

        if v_from <> v_to then
            v_tiles := jsonb_set(v_tiles, array[v_id], to_jsonb(v_to));
            v_applied := v_applied || jsonb_build_array(jsonb_build_object(
                'tile', v_id, 'from', v_from, 'status', v_to
            ));
        end if;
    end loop;

    if jsonb_array_length(v_applied) = 0 then
        raise exception 'No changes to publish.';
    end if;

    update public.floor_state
    set tiles = v_tiles, version = v_version + 1, updated_at = now()
    where id = 1;

    insert into public.floor_updates (author, changes)
    values (btrim(p_name), v_applied);

    return jsonb_build_object('tiles', v_tiles, 'saved', jsonb_array_length(v_applied));
end;
$$;

-- Public publishing is intentional for this initial version.
-- The publish function validates tiles and writes update history atomically.
revoke all on function public.publish_floor_update(text, jsonb) from public;
grant execute on function public.publish_floor_update(text, jsonb) to anon, authenticated;
