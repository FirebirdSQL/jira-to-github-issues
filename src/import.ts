import {
	Attachment,
	Blob,
	createNativeClient,
	getDefaultLibraryFilename,
	Transaction
} from 'node-firebird-driver-native';

import { request } from '@octokit/request';
import * as linkify  from 'linkify-it';
import { gfm } from 'markdown-escapes';

import { allUsers, config } from './config';


interface JiraIssue {
	ISS_ID: number;
	ISS_PKEY: string;
	ISS_PROJECT: string;
	ISS_REPORTER: string;
	ISS_ASSIGNEE: string;
	ISS_SUMMARY: string;
	ISS_DESCRIPTION: Blob;
	ISS_CREATED: Date;
	ISS_UPDATED: Date;
	ISS_RESOLVED: Date;
	ISS_CLOSED: Date;
	ISS_VERSIONS: string;
	ISS_FIX_VERSIONS: string;
	ISS_COMPONENTS: string;
	ISS_LINKS: string;
	ISS_ATTACHMENTS: string;
	ISS_VOTES: number;
	//ISS_SECURITY: string;
	ISS_RESOLUTION: string;
	ISS_STATUS: string;
	ISS_TYPE: string;
}

interface JiraComment {
	COM_ID: number;
	COM_NUM: number;
	COM_AUTHOR: string;
	COM_DESCRIPTION: Blob;
	COM_CREATED: Date;
}

interface JiraIssueComments {
	issue: JiraIssue;
	comments: JiraComment[];
}

let attachment: Attachment;
let transaction: Transaction;


//// TODO: Use display name for Jira users.
function jiraToGitHubUser(jiraName: string): string {
	const mappedName = allUsers[jiraName];
	return mappedName ? `@${mappedName}` : jiraName;
}


const jiraLinkRegExp = new RegExp(
	`(${config.jiraUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/browse/)` +
	`(${Object.keys(config.projects).join('|')})\\-(\\d*)`, 'g');

function simplifyJiraLinks(text: string): string {
	const matches = [...text.matchAll(jiraLinkRegExp)].reverse();

	for (const match of matches) {
		text = text.substring(0, match.index) +
			`${match[2]}-${match[3]}` +
			text.substring(match.index + match[0].length);
	}

	return text;
}


function textToMarkdown(text: string): string {
	const linkMatches = linkify().match(text) ?? [];
	let result = '';
	let start = 0;

	for (let i = 0; i <= linkMatches.length; ++i) {
		const end = i == linkMatches.length ? text.length : linkMatches[i].index;

		result += gfm.reduce(
			(str, replacement) => str.split(replacement).join(replacement == '#' ? '#&#x2060;' : '\\' + replacement),
			text.substring(start, end)
		);

		if (i < linkMatches.length) {
			result += `<${linkMatches[i].url}>`;
			start = linkMatches[i].lastIndex;
		}
	}

	return result;
}


const transformRegExp = new RegExp(`(${Object.keys(config.projects).join('|')})\\\\-\\d*`, 'g');

function transformReferences(text: string): string {
	const matches = [...text.matchAll(transformRegExp)].reverse();

	for (const match of matches) {
		const project = match[1];
		text = text.substring(0, match.index) + '[' +
			match[0] + `](https://github.com/${config.projects[project]}/issues?q=${match[0]}+in%3Atitle)` +
			text.substring(match.index + match[0].length);
	}

	return text;
}

async function createGitHubIssueComments(jira: JiraIssueComments) {
	let description = '';

	if (jira.issue.ISS_DESCRIPTION) {
		const descriptionStream = await attachment.openBlob(transaction, jira.issue.ISS_DESCRIPTION);
		const buffer = Buffer.alloc(8192);
		let count: number;

		while ((count = await descriptionStream.read(buffer)) != -1)
			description += buffer.slice(0, count);

		await descriptionStream.close();
	}

	const commentsDescriptions = await Promise.all(jira.comments.map(async comment => {
		let commentDescription = '';

		if (comment.COM_DESCRIPTION) {
			const descriptionStream = await attachment.openBlob(transaction, comment.COM_DESCRIPTION);
			const buffer = Buffer.alloc(8192);
			let count: number;

			while ((count = await descriptionStream.read(buffer)) != -1)
				commentDescription += buffer.slice(0, count);

			await descriptionStream.close();
		}

		return commentDescription;
	}));

	const affectVersions = jira.issue.ISS_VERSIONS?.split(',') ?? [];
	const fixVersions = jira.issue.ISS_FIX_VERSIONS?.split(',') ?? [];
	const components = jira.issue.ISS_COMPONENTS?.split(',') ?? [];

	const links = (jira.issue.ISS_LINKS?.split(',') ?? [])
		.map(link => [link.substring(0, link.indexOf(':')), link.substring(link.indexOf(':') + 1)]);

	const attachments = (jira.issue.ISS_ATTACHMENTS?.split('|') ?? [])
		.map(attachment => [attachment.substring(0, attachment.indexOf(':')), attachment.substring(attachment.indexOf(':') + 1)])
		.map(([id, name]) =>
			`[${name}](https://github.com/${config.attachmentsProject}/raw/${config.attachmentsBranch}/` +
			`${jira.issue.ISS_PROJECT}/${jira.issue.ISS_PKEY}/${id}_${encodeURIComponent(name)})`
		);

	const labels = [
		...affectVersions.map(s => `affect-version: ${s}`),
		...fixVersions.map(s => `fix-version: ${s}`),
		...components.map(s => `component: ${s}`),
		...(jira.issue.ISS_TYPE ? [`type: ${jira.issue.ISS_TYPE}`] : [])
	];

	//// FIXME: Error importing CORE-5342: HttpError: Payload too big: 1048576 bytes are allowed, 1314299 bytes were posted.

	const useAssigneeField = jira.issue.ISS_ASSIGNEE != undefined && config.usersMap.contributors[jira.issue.ISS_ASSIGNEE] != undefined;

	const body =
		`Submitted by: ${jiraToGitHubUser(jira.issue.ISS_REPORTER)}\n\n` +
		(!useAssigneeField && jira.issue.ISS_ASSIGNEE ? `Assigned to: ${jiraToGitHubUser(jira.issue.ISS_ASSIGNEE)}\n\n` : '') +
		(links.length > 0 ?
			transformReferences(textToMarkdown(links.map(link =>
				`${link[0].substr(0, 1).toUpperCase()}${link[0].substr(1)} ${link[1]}`).join('\n')
			)) + '\n\n'
			:
			''
		) +
		(attachments.length > 0 ?
			`Attachments:\n${attachments.join('\n')}\n\n`
			:
			''
		) +
		(jira.issue.ISS_VOTES > 0 ? `Votes: ${jira.issue.ISS_VOTES}\n\n` : '') +
		transformReferences(textToMarkdown(simplifyJiraLinks(description)));

	return {
		jira,
		gitHub: {
			issue: {
				title: `${jira.issue.ISS_SUMMARY} [${jira.issue.ISS_PKEY}]`,
				body,
				labels,
				created_at: jira.issue.ISS_CREATED,
				updated_at: jira.issue.ISS_UPDATED,
				assignee: useAssigneeField ? config.usersMap.contributors[jira.issue.ISS_ASSIGNEE] : undefined,
				closed_at: jira.issue.ISS_STATUS == 'Resolved' || jira.issue.ISS_STATUS == 'Closed' ?
					(jira.issue.ISS_RESOLVED ?? jira.issue.ISS_CLOSED ?? jira.issue.ISS_UPDATED) : undefined,
				closed: jira.issue.ISS_STATUS == 'Resolved' || jira.issue.ISS_STATUS == 'Closed' ? true : false
			},
			comments: jira.comments.map((comment, index) => ({
				body:
					`Commented by: ${jiraToGitHubUser(comment.COM_AUTHOR)}\n\n` +
					transformReferences(textToMarkdown(simplifyJiraLinks(commentsDescriptions[index]))),
				created_at: comment.COM_CREATED
			}))
		}
	}
}


async function run() {
	const projectList = Object.keys(config.projects).map(p => `'${p}'`).join(', ');

	const client = createNativeClient(getDefaultLibraryFilename());

	attachment = await client.connect(config.database);
	transaction = await attachment.startTransaction();

	const suppressTicketsClause = config.suppressTickets?.length > 0 ?
		`and iss.pkey not in (${config.suppressTickets.map(ticket => `'${ticket}'`) .join(', ')})` :
		'';

	const resultSet = await attachment.executeQuery(transaction, `
		select iss.id iss_id,
		       iss.pkey iss_pkey,
		       pr.pkey iss_project,
		       iss.reporter iss_reporter,
		       iss.assignee iss_assignee,
		       iss.summary iss_summary,
		       iss.description iss_description,
		       iss.environment iss_environment,
		       iss.priority iss_priority,
		       res.pname iss_resolution,
		       sta.pname iss_status,
		       lower(typ.pname) iss_type,
		       iss.created iss_created,
		       iss.updated iss_updated,
		       (select max(chagro.created)
		          from changegroup chagro
		          join changeitem chaite
		            on chaite.groupid = chagro.id
		          where chaite.field = 'status' and
		                chaite.newstring = 'Resolved' and
		                chagro.issueid = iss.id
		       ) iss_resolved,
		       (select max(chagro.created)
		          from changegroup chagro
		          join changeitem chaite
		            on chaite.groupid = chagro.id
		          where chaite.field = 'status' and
		                chaite.newstring = 'Closed' and
		                chagro.issueid = iss.id
		       ) iss_closed,
		       iss.votes iss_votes,
		       (select cast(list(trim(projver.vname), ',') as varchar(6000))
		          from nodeassociation nodass
		          join projectversion projver
		            on projver.id = nodass.sink_node_id
		          where nodass.source_node_entity = 'Issue' and
		                nodass.association_type = 'IssueVersion' and
		                nodass.source_node_id = iss.id
		       ) iss_versions,
		       (select cast(list(trim(projver.vname), ',') as varchar(6000))
		          from nodeassociation nodass
		          join projectversion projver
		            on projver.id = nodass.sink_node_id
		          where nodass.source_node_entity = 'Issue' and
		                nodass.association_type = 'IssueFixVersion' and
		                nodass.source_node_id = iss.id
		       ) iss_fix_versions,
		       (select cast(list(lower(trim(com.cname)), ',') as varchar(6000))
		          from nodeassociation nodass
		          join component com
		            on com.id = nodass.sink_node_id
		          where nodass.source_node_entity = 'Issue' and
		                nodass.association_type = 'IssueComponent' and
		                nodass.source_node_id = iss.id
		       ) iss_components,
		       (select cast(list(decode(link.source, iss.id, linktype.outward, linktype.inward) || ':' || isu2.pkey, ',') as varchar(6000))
		          from issuelink link
		          join issuelinktype linktype
		            on linktype.id = link.linktype
		          join jiraissue isu2
		            on isu2.id = decode(link.source, iss.id, link.destination, link.source)
		          where (link.source = iss.id or link.destination = iss.id)
		       ) iss_links,
		       (select cast(list(att.id || ':' || att.filename, '|') as varchar(6000))
		          from fileattachment att
		          where att.issueid = iss.id
		       ) iss_attachments,
		       iss.votes iss_votes,
		       act.id com_id,
		       act.actionnum com_num,
		       act.author com_author,
		       act.actionbody com_description,
		       act.created com_created
		  from jiraissue iss
		  join project pr
		    on pr.id = iss.project
		  left join resolution res
		    on res.id = iss.resolution
		  left join issuestatus sta
		    on sta.id = iss.issuestatus
		  left join issuetype typ
		    on typ.id = iss.issuetype
		  left join jiraaction act
		    on act.issueid = iss.id
		  where pr.pkey in (${projectList}) and
		        iss.security is null and
		        iss.gh_import_status_code is null
		        ${suppressTicketsClause}
		  order by iss.project,
		           cast(substring(iss.pkey from position('-' in iss.pkey) + 1) as numeric(10)),
		           act.created
		`);

	const updateIssue = await attachment.prepare(transaction, `
		update jiraissue
		  set gh_import_result_json = ?,
		      gh_import_status_code = ?,
		      gh_import_id = ?,
		      gh_import_status_text = ?,
		      gh_import_url = ?
		  where id = ?
	`)

	const jiraIssuesComments: JiraIssueComments[] = [];
	let lastIssueComments: JiraIssueComments = null;

	while (true) {
		const rows = await resultSet.fetchAsObject<JiraIssue & JiraComment>();

		if (rows.length == 0)
			break;

		for (const row of rows) {
			if (row.ISS_ID != lastIssueComments?.issue.ISS_ID) {
				lastIssueComments = Object.keys(row)
					.filter(key => key.startsWith('ISS_'))
					.reduce(
						(obj: JiraIssueComments, key) => {
							(obj.issue as any)[key] = (row as any)[key];
							return obj;
						},
						{ issue: {}, comments: [] } as unknown as JiraIssueComments
					);

				jiraIssuesComments.push(lastIssueComments);
			}

			if (row.COM_ID) {
				lastIssueComments.comments.push(Object.keys(row)
					.filter(key => key.startsWith('COM_'))
					.reduce(
						(obj: JiraComment, key) => {
							(obj as any)[key] = (row as any)[key];
							return obj;
						},
						{} as JiraComment
					)
				);
			}
		}
	}

	const issues = await Promise.all(jiraIssuesComments.map(createGitHubIssueComments));

	for (const issue of issues)
	{
		try {
			const ret = await request(`POST /repos/${config.projects[issue.jira.issue.ISS_PROJECT]}/import/issues`, {
				headers: {
					authorization: `token ${config.token}`,
					accept: 'application/vnd.github.golden-comet-preview+json'
				},
				...issue.gitHub
			});

			console.info(`Importing ${issue.jira.issue.ISS_PKEY}: ${ret.status} - ${ret.data?.status}`);

			const resultBlob = await attachment.createBlob(transaction);
			await resultBlob.write(Buffer.from(JSON.stringify(ret), 'utf-8'));
			await resultBlob.close();

			await updateIssue.execute(transaction, [
				resultBlob,
				ret.status,
				ret.data?.id,
				ret.data?.status,
				ret.data?.url,
				issue.jira.issue.ISS_ID
			]);

			await transaction.commitRetaining();
		}
		catch (e) {
			console.error(`Error importing ${issue.jira.issue.ISS_PKEY}: ${e}`);
			break;
		}
	}

	await updateIssue.dispose();
	await resultSet.close();
	await transaction.commit();
	await attachment.disconnect();
}

run().catch(e => console.error(e));
