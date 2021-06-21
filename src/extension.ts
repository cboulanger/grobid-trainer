import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

import {WebDav} from './webdavUtils';
import {FileStat} from 'webdav';
import { Client } from 'ssh2';
import { resolve } from 'path';

const { 
	WEBDAV_URL, WEBDAV_USER, WEBDAV_PASSWD, 
	GROBID_SRC_DIR, GROBID_IN_DIR, GROBID_OUT_DIR,
	SSH_HOST, SSH_PORT, SSH_USER, SSH_KEY_FILE
} = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8"));

interface SourceFileModel {
	filename: string,
	doi: string
}
interface TrainingFileModel extends SourceFileModel {
	type: string
};

const extract = (filename: string, regExp: RegExp): string => {
	let match = filename.match(regExp);
	return match ? match[1] : `No match for ${regExp.toString()}`;
};

const wd = new WebDav(WEBDAV_URL, WEBDAV_USER, WEBDAV_PASSWD);
const client = wd.getClient();

async function getSshClient() : Promise<Client> {
	return new Promise((resolve, reject) => {
		const conn = new Client();
		conn.on('ready', () => resolve(conn))
		.on('timeout', () => reject(new Error("Timeout")))
		.on('error', err => reject(err))
		.connect({
		  host: SSH_HOST,
		  port: Number(SSH_PORT),
		  username: SSH_USER,
		  privateKey: fs.readFileSync(SSH_KEY_FILE)
		});
	});
}

let sshClient: Client; 
async function sshExec(cmd:string) : Promise<string> {
	if (!sshClient) {
		sshClient = await getSshClient();
	}
	return new Promise((resolve, reject) => {
		sshClient.exec(cmd, (err, stream) => {
			if (err) {
				reject(err);
			}
			let result =""; 
			stream.on('close', (code: number) => {
				if (code !== 0) {
					reject(new Error(`'${cmd}' returned exit code ${code}`));
				}
				resolve(result);
			})
			.on('data', (data: string) => {
				result += data;
			})
			.stderr.on('data', (data) => {
				reject(data);
			});			
		});
	});
}

async function getFilenames(dir: string, ext?: string): Promise<string[]> {
	const filestats = (await client.getDirectoryContents(dir)) as FileStat[];
	const filenames: string[] = filestats
		.filter(filestat => filestat.type === "file")
		.map(filestat => filestat.filename)
		.map(filename => filename.replace("/"+dir+"/",""))
		.filter(filename => ext ? filename.endsWith(ext) : true)
		.sort();
	return filenames;
}

async function createTrainingFiles() {
	try {
		// generate list of DOIs 
		const sourceFileModels: SourceFileModel[] = 
			(await getFilenames(GROBID_SRC_DIR, ".pdf"))
				.map(filename => ({
					filename,
					doi: extract(filename, /^(10\.[^.]+)/).replace("_","/"),
				}));
		type QpModelItem = vscode.QuickPickItem & {model:SourceFileModel};
		const items: QpModelItem[] = sourceFileModels.map(model => ({
			label: `${model.doi}`,
			model
		}));
		
		// show list to user, to pick one or more files
		const quickPickOptions: vscode.QuickPickOptions = {
			canPickMany: true
		};
		let fileModels = await vscode.window.showQuickPick(items, quickPickOptions);
		if (!fileModels) {
			return;
		}
		// import { ExtensionContext, StatusBarAlignment, window, StatusBarItem, Selection, workspace, TextEditor, commands, ProgressLocation } from 'vscode';
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "I am long running!",
			cancellable: true
		}, (progress, token) => {
			token.onCancellationRequested(() => {
				console.log("User canceled the long running operation");
			});

			progress.report({ increment: 0 });

			setTimeout(() => {
				progress.report({ increment: 10, message: "I am long running! - still going..." });
			}, 1000);

			setTimeout(() => {
				progress.report({ increment: 40, message: "I am long running! - still going even more..." });
			}, 2000);

			setTimeout(() => {
				progress.report({ increment: 50, message: "I am long running! - almost there..." });
			}, 3000);

			const p = new Promise<void>(resolve => {
				setTimeout(() => {
					resolve();
				}, 5000);
			});

			return p;
		});
		


	} catch (ex) {
		vscode.window.showErrorMessage(ex);
	}
}

async function openTrainingFiles() {
	try {
		// generate list of DOIs 
		const trainingFileModels: TrainingFileModel[] = 
			(await getFilenames(GROBID_OUT_DIR, "tei.xml"))
				.map(filename => ({
					filename,
					doi: extract(filename, /^(.+?)\.training/).replace("_","/"),
					type: extract(filename, /training\.([^.]+)/)
				}));
	
		type QpModelItems = vscode.QuickPickItem & {model:TrainingFileModel};
		const items: QpModelItems[] = trainingFileModels.map(model => ({
			label: `${model.doi} (${model.type})`,
			model
		}));
		// show list to user
		const quickPickOptions: vscode.QuickPickOptions = {
			canPickMany: false
		};
		const item = await vscode.window.showQuickPick(items);
		if (item) {
			vscode.commands.executeCommand('workbench.action.closeAllEditors');

			const xmlPath = path.join(GROBID_OUT_DIR,item.model.filename);
			const tmpXml = path.join(os.tmpdir(), item.model.filename);
			await wd.download(xmlPath, tmpXml);
			const xmlTab = vscode.window.showTextDocument(vscode.Uri.file(tmpXml));
			
			const pdfPath = path.join(GROBID_IN_DIR, item.model.doi.replace("/","_") + ".pdfa.pdf");
			const tmpPdf = path.join(os.tmpdir(), path.basename(pdfPath));
			await wd.download(pdfPath, tmpPdf);
			vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(tmpPdf), "pdf.preview",vscode.ViewColumn.Beside);
			
		}
	} catch (ex) {
		vscode.window.showErrorMessage(ex);
	}
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('grobid-trainer.createTrainingFiles', createTrainingFiles));
	context.subscriptions.push(vscode.commands.registerCommand('grobid-trainer.openTrainingFiles', openTrainingFiles));
}

// this method is called when your extension is deactivated
export function deactivate() {}
