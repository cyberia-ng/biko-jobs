alter table master_keys add column password_hash blob;
create unique index master_keys_password_hash on master_keys (password_hash);
alter table master_keys add column password_salt blob;
