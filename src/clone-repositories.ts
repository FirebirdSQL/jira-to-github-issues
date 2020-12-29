import { exec } from 'child_process';
import { mkdirSync } from 'fs';
import { config } from './config';


async function run() {
	for (const project in config.projects) {
		const dirName = `./repositories/${project}`;
		const url = `git@github.com:${config.projects[project]}.git`;

		mkdirSync(dirName, { recursive: true });

		try {
			console.log(`Cloning ${url} in ${dirName}`);

			await new Promise((resolve, reason) => {
				exec(`git clone --bare ${url} ${dirName}`, (error, stdout, stderr) => {
					if (error)
						reason(error);
					else
						resolve({ stdout, stderr });
				});
			});
		}
		catch (e: unknown) {
			console.error(e);
			break;
		}
	}
}

run().catch(e => console.error(e));
