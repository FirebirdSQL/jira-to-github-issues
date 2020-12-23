import {
	Attachment,
	createNativeClient,
	getDefaultLibraryFilename,
	Transaction
} from 'node-firebird-driver-native';

import { request } from '@octokit/request';

import { config } from './config';


interface JiraGitHubIssue {
	ISS_ID: number;
	ISS_PKEY: string;
	ISS_GH_IMPORT_URL: string;
}

let attachment: Attachment;
let transaction: Transaction;


async function run() {
	const projectList = Object.keys(config.projects).map(p => `'${p}'`).join(', ');

	const client = createNativeClient(getDefaultLibraryFilename());

	attachment = await client.connect(config.database);
	transaction = await attachment.startTransaction();

	const resultSet = await attachment.executeQuery(transaction, `
		select iss.id iss_id,
		       iss.pkey iss_pkey,
		       iss.gh_import_url iss_gh_import_url
		  from jiraissue iss
		  join project pr
		    on pr.id = iss.project
		  where pr.pkey in (${projectList}) and
		        iss.gh_import_url is not null and
		        iss.gh_imported_url is null and
		        (iss.gh_imported_status_text is null or iss.gh_imported_status_text = 'pending')
		  order by iss.project,
		           cast(substring(iss.pkey from position('-' in iss.pkey) + 1) as numeric(10))
		`);

	const updateIssue = await attachment.prepare(transaction, `
		update jiraissue
		  set gh_imported_result_json = ?,
		      gh_imported_status_code = ?,
		      gh_imported_status_text = ?,
		      gh_imported_url = ?
		  where id = ?
	`)

	const issues = await resultSet.fetchAsObject<JiraGitHubIssue>();

	for (const issue of issues) {
		try {
			const ret = await request(`GET ${issue.ISS_GH_IMPORT_URL}`, {
				headers: {
					authorization: `token ${config.token}`,
					accept: 'application/vnd.github.golden-comet-preview+json'
				}
			});

			console.info(`Checking import of ${issue.ISS_PKEY}: ${ret.status} - ${ret.data?.status}`);

			const resultBlob = await attachment.createBlob(transaction);
			await resultBlob.write(Buffer.from(JSON.stringify(ret), 'utf-8'));
			await resultBlob.close();

			await updateIssue.execute(transaction, [
				resultBlob,
				ret.status,
				ret.data?.status,
				ret.data?.issue_url,
				issue.ISS_ID
			]);

			await transaction.commitRetaining();
		}
		catch (e) {
			console.error(`Error checking import of ${issue.ISS_PKEY}: ${e}`);
			break;
		}
	}

	await updateIssue.dispose();
	await resultSet.close();
	await transaction.commit();
	await attachment.disconnect();
}

run().catch(e => console.error(e));
