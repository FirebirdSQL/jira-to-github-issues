# Import instructions

- Ensure jira database is updated and clean from previous tests
- Ensure `repositories` is cleaned from previous tests
- Copy `.config.template.json` to `.config.json`
- Configure `.config.json`
  - Set token (using `firebird-issue-importer` account)
  - Set database (better to not use embedded)
  - Set project mappings
  - Set usersMap mappings
  - Set attachments project URL
- Edit CORE-2521 and CORE-5342 to decrease they size
- Enable issues in each project
- Create attachments repository and import files (filtering out security issues?)
- `yarn run clone-repositories`
- `yarn run parse-logs`
- `yarn run import`
- `yarn run import-check`
