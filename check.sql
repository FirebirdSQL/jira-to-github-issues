select gh_imported_status_text, count(*)
  from jiraissue
  where gh_import_status_code is not null
  group by gh_imported_status_text;

set list on;

select *
  from jiraissue
  where gh_import_status_code is not null and
        gh_imported_status_text <> 'imported';

/*
update jiraissue
  set gh_import_result_json = null,
      gh_import_status_code = null,
      gh_import_id = null,
      gh_import_status_text = null,
      gh_import_url = null,
      gh_imported_status_text = null,
      gh_imported_url = null,
      gh_imported_result_json = null,
      gh_imported_status_code = null
  where pkey in ()
*/
