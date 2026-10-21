delete from blobs where rowid not in (
  select min(rowid)
  from blobs
  group by name, session
);
drop index blobs_id_session;
create unique index if not exists blobs_id_session on blobs (name, session);
