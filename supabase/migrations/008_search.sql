-- Full-text search over messages; row level security keeps results limited to channels the caller can read.

alter table public.messages add column search tsvector generated always as (to_tsvector('simple', coalesce(body, ''))) stored;
create index messages_search_idx on public.messages using gin (search);

-- Turns free text into a safe prefix query: "hel wor!" becomes "hel:* & wor:*".
create function private.prefix_query(p_text text) returns text language sql immutable set search_path = '' as $$
  select string_agg(word || ':*', ' & ')
  from regexp_split_to_table(lower(regexp_replace(coalesce(p_text, ''), '[^[:alnum:]]+', ' ', 'g')), ' ') as word
  where word <> '';
$$;
grant execute on function private.prefix_query(text) to authenticated;

create function public.search_messages(p_query text, p_channel uuid default null, p_limit int default 30)
returns setof public.messages language sql stable set search_path = '' as $$
  select m.*
  from public.messages m
  where m.deleted_at is null
    and (p_channel is null or m.channel_id = p_channel)
    and private.prefix_query(p_query) is not null
    and m.search @@ to_tsquery('simple', private.prefix_query(p_query))
  order by m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

select private.lock_down_functions();
