create table master_keys (
  id integer primary key,
  uuid text,
  name text,
  encryption_public_key blob,
  encryption_private_key_encrypted blob,
  signing_public_key blob,
  signing_private_key_encrypted blob,
  password_hash blob,
  password_hardness integer,
  password_salt blob
);
create unique index master_keys_uuid on master_keys (uuid);
create unique index master_keys_name on master_keys (name);
create unique index master_keys_password_hash on master_keys (password_hash);

create table jobs (
  id integer primary key asc,
  uuid text unique
);
create unique index jobs_uuid on jobs (uuid);

create table job_keys (
  id integer primary key asc,
  job integer references jobs (id),
  master_key integer references master_keys (id),
  encrypted_job_key blob
);
create unique index job_keys_job_master_key on job_keys (job, master_key);

create table job_events (
  id integer primary key asc,
  job integer references jobs (id),
  uuid text unique,
  data blob
);
create unique index job_events_uuid on job_events (uuid);
create index job_events_job on job_events (job);
