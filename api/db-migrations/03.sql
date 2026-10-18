alter table sessions add column finalized integer default FALSE;
alter table events add column uuid text;
create unique index events_uuid on events (uuid);
