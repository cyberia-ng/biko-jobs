create table if not exists sessions (
  id integer primary key asc,
  name text unique
);
create index if not exists sessions_name on sessions (name);

create table if not exists events (
  id integer primary key asc,
  session integer references sessions (id),
  data blob
);
create index if not exists events_session on events (session);

create table if not exists blobs (
  id integer primary key asc,
  name text,
  session integer references sessions (id),
  data blob
);
create index if not exists blobs_id_session on blobs (name, session);
