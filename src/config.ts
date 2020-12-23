import * as fs from 'fs';


interface Config {
	token: string;
	database: string;
	jiraUrl: string;
	attachmentsProject: string;
	attachmentsBranch: string;
	projects: {
		[index: string]: string;
	};
	usersMap: {
		contributors: {
			[index: string]: string;
		}
		others: {
			[index: string]: string;
		}
	};
	suppressTickets: string[];
}


export const config = JSON.parse(fs.readFileSync('.config.json').toString('utf8')) as Config;

export const allUsers = {
	...config.usersMap.contributors,
	...config.usersMap.others
};
