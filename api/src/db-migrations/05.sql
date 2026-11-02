alter table master_keys add column password_hash blob;
alter table master_keys add column password_hardness integer;
create unique index master_keys_password_hash on master_keys (password_hash);
alter table master_keys add column password_salt blob;
