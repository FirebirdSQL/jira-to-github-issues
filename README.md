# Import instructions

- Ensure jira database is updated and clean from previous import tests
- Copy `.config.template.json` to `.config.json`
- Add `firebird-issue-importer` to `FirebirdSQL` organization
- Configure `.config.json`
  - Set token (using `firebird-issue-importer` account)
  - Set database (better to not use embedded)
  - Set project mappings
  - Set usersMap mappings
  - Set attachments project URL
- Review security ticket in Jira turning public what would be possible
- Try to edit CORE-5342 to decrease its size
- Enable issues in each project
- Create attachments repository and import files filtering out security issues
- `yarn run clone-repositories`
- `yarn run parse-logs`
- `yarn run import`
- `yarn run import-check`
