create table streams (
  id integer primary key asc,
  uuid text unique
);
create unique index streams_uuid on streams (uuid);

create table stream_keys (
  id integer primary key asc,
  stream integer references streams (id),
  master_key integer references master_keys (id),
  encrypted_stream_key blob
);
create unique index stream_keys_stream_master_key on stream_keys (stream, master_key);

create table stream_events (
  id integer primary key asc,
  stream integer references streams (id),
  uuid text unique,
  data blob
);
create unique index stream_events_uuid on stream_events (uuid);
create index stream_events_stream on stream_events (stream);

insert into streams (id, uuid)
  select id, uuid from jobs;
insert into stream_keys (id, stream, master_key, encrypted_stream_key)
  select id, job, master_key, encrypted_job_key from job_keys;
insert into stream_events (id, stream, uuid, data)
  select id, job, uuid, data from job_events;

drop table job_events;
drop table job_keys;
drop table jobs;

create table stream_names (
  id integer primary key asc,
  stream integer references streams (id),
  name text
);
create unique index stream_names_name on stream_names (name);
