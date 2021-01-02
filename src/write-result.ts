import { promises as fs } from 'fs';

import {
	Attachment,
	createNativeClient,
	getDefaultLibraryFilename,
	Transaction
} from 'node-firebird-driver-native';

import { config } from './config';


let attachment: Attachment;
let transaction: Transaction;


async function run() {
	const projectList = Object.keys(config.projects).map(p => `'${p}'`).join(', ');

	const client = createNativeClient(getDefaultLibraryFilename());

	attachment = await client.connect(config.database);
	transaction = await attachment.startTransaction();

	const allIssues: { [key: string]: object } = {};

	const resultSet = await attachment.executeQuery(transaction, `
		select iss.pkey key,
		       cast(iss.gh_import_result_json as varchar(512)) import_result_json,
		       iss.gh_import_status_code import_status_code,
		       iss.gh_import_id import_id,
		       iss.gh_import_status_text import_status_text,
		       iss.gh_import_url import_url,
		       cast(iss.gh_imported_result_json as varchar(512)) imported_result_json,
		       iss.gh_imported_status_code imported_status_code,
		       iss.gh_imported_status_text imported_status_text,
		       iss.gh_imported_url imported_url
		  from jiraissue iss
		  join project pr
		    on pr.id = iss.project
		  where pr.pkey in (${projectList})
		  order by iss.project,
		           cast(substring(iss.pkey from position('-' in iss.pkey) + 1) as numeric(10))
		`);

	while (true) {
		const issues = await resultSet.fetchAsObject<{ KEY: string }>();

		if (issues.length == 0)
			break;

		for (const issue of issues) {
			const { KEY: key, ...issueData } = issue;
			allIssues[key] = issueData;
		}
	}

	await resultSet.close();
	await transaction.commit();
	await attachment.disconnect();

	await fs.writeFile('import-result.json', JSON.stringify(allIssues));
}

run().catch(e => console.error(e));
