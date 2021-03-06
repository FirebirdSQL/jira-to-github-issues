import * as fs from 'fs';


interface Config {
	token: string;
	database: string;
	jiraUrl: string;
	publicAttachmentsProject: string;
	privateAttachmentsProject: string;
	attachmentsBranch: string;
	projects: {
		[index: string]: string;
	};
	usersMap: {
		[index: string]: string;
	};
	suppressTickets?: string[];
}


export const config = JSON.parse(fs.readFileSync('.config.json').toString('utf8')) as Config;
