import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { config } from './config';


async function run() {
	const regExp = new RegExp(`(${Object.keys(config.projects).join('|')})\\-\\d*`, 'g');
	const map = new Map<string, string[]>();

	for (const project in config.projects) {
		const dirName = `./repositories/${project}`;

		try {
			console.log(`Parsing log of ${dirName}`);

			const out = await new Promise<{ stdout: string, stderr: string }>((resolve, reason) => {
				const grepArgs = Object.keys(config.projects).map(project => `--grep="${project}-[0-9]\\+"`).join(' ');

				exec(`(cd ${dirName} && git log --branches ${grepArgs} "--pretty=format:%H%w(0,0,4)%+B%w(0,0,0)%n||||")`, (error, stdout, stderr) => {
					if (error)
						reason(error);
					else
						resolve({ stdout, stderr });
				});
			});

			const entries = out.stdout
				.split('\n||||\n')
				.flatMap(line => {
					const sepPos = line.indexOf('\n');
					const hash = line.substring(0, sepPos);
					const text = line.substring(sepPos + 1);
					const matches = [...text.matchAll(regExp)];

					return matches.map(match => [match[0], `${config.projects[project]}@${hash}`] as const);
				});

			entries.forEach(([ticket, hash]) => {
				const hashes = map.get(ticket);

				if (hashes) {
					if (hashes.indexOf(hash) == -1)
						hashes.push(hash);
				}
				else
					map.set(ticket, [hash])
			});
		}
		catch (e: unknown) {
			console.error(e);
			break;
		}
	}

	console.log('Writing repositories/logs.json');
	await fs.writeFile('repositories/logs.json', JSON.stringify([...map]));
}

run().catch(e => console.error(e));
