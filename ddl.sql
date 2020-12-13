alter table jiraissue
  add gh_import_result_json blob sub_type text character set utf8,
  add gh_import_status_code numeric(3),
  add gh_import_id numeric(10),
  add gh_import_status_text varchar(30) character set utf8,
  add gh_import_url varchar(255) character set utf8,
  add gh_imported_result_json blob sub_type text character set utf8,
  add gh_imported_status_code numeric(3),
  add gh_imported_status_text varchar(30) character set utf8,
  add gh_imported_url varchar(255) character set utf8;
