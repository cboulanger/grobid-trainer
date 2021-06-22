import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

import {WebDav} from './webdavUtils';
import {FileStat} from 'webdav';
import { Client } from 'ssh2';

const { 
	WEBDAV_URL, WEBDAV_USER, WEBDAV_PASSWD, WEBDAV_DIR,
	GROBID_VERSION, GROBID_DIR, GROBID_SRC_DIR, GROBID_IN_DIR, GROBID_OUT_DIR, GROBID_CORRECTED_DIR,
	SSH_HOST, SSH_PORT, SSH_USER, SSH_KEY_FILE
} = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8"));

const GROBID_IN_PATH = path.join(WEBDAV_DIR, GROBID_IN_DIR);
const GROBID_OUT_PATH = path.join(WEBDAV_DIR, GROBID_OUT_DIR);
const GROBID_CORE_JAR_PATH = `${GROBID_DIR}/grobid-core/build/libs/grobid-core-${GROBID_VERSION}-onejar.jar`;
const GROBID_TRAINING_DATA_PATH = `${GROBID_DIR}/grobid-trainer/resources/dataset`;
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
		console.log(`Executing ${cmd}:\n`);
		sshClient.exec(cmd, (err, stream) => {
			if (err) {
				console.error(err);
				reject(err);
			}
			let result =""; 
			stream.on('close', (code: number) => {
				if (code !== 0) {
					reject(new Error(`'${cmd}' returned exit code ${code}`));
				}
				resolve(result);
			})
			.on('data', (data: Buffer) => {
				const text = data.toString("utf8");
				console.log(text);
				result += text;
			})
			.stderr.on('data', (data: Buffer) => {
				const text = data.toString("utf8");
				console.log(text);
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
		let result = (await vscode.window.showQuickPick(items, quickPickOptions)) as unknown; // returns QpModelItem[] | undefined
		if (!result) {
			return;
		}
		await sshExec(`rm -f ${GROBID_IN_PATH}/*`);
		await sshExec(`rm -f ${GROBID_OUT_PATH}/*`);
		let pickedItems = result as QpModelItem[];
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Creating traininng files",
			cancellable: true
		}, async (progress, token) => {
			let cancel = false;
			token.onCancellationRequested(() => {
				cancel = true;
			});
			progress.report({ increment: 0 });
			for (const pickedItem of pickedItems) {
				if (cancel) {
					progress.report({ increment: 100, message: "Cancelled" });
					break;
				}
				let message = pickedItem.model.doi;
				progress.report({ increment: Math.round(100/pickedItems.length), message});
				const GROBID_SRC_FILE = path.join(WEBDAV_DIR, GROBID_SRC_DIR, pickedItem.model.filename);
				const GROBID_TGT_FILE = path.join(GROBID_IN_PATH, pickedItem.model.filename.replace(".pdfa",""));
				await sshExec(`cp ${GROBID_SRC_FILE} ${GROBID_TGT_FILE}`);
				const cmd = `java -Xmx4G -jar ${GROBID_CORE_JAR_PATH}`;
				const params = `-gH ${GROBID_DIR}/grobid-home -dIn ${GROBID_IN_PATH} -dOut ${GROBID_OUT_PATH}`;
				await sshExec(`${cmd} ${params} -exe createTraining`);
			}
		});
	} catch (ex) {
		console.error(ex);
		vscode.window.showErrorMessage(ex.message);
	}
}

async function openTrainingFiles() {
	try {
		// generate list of DOIs 
		const trainingFileModels: TrainingFileModel[] = 
			(await getFilenames(GROBID_OUT_DIR, "tei.xml"))
				.map(filename => ({
					filename,
					doi: extract(filename, /^(10\.[^.]+)/).replace("_","/"),
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
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			const xmlPath = path.join(GROBID_OUT_DIR,item.model.filename);
			const tmpXml = path.join(os.tmpdir(), item.model.filename);
			const corrXml = path.join(GROBID_CORRECTED_DIR, item.model.filename);
			await wd.download(xmlPath, tmpXml);
			const xmlTab = await vscode.window.showTextDocument(vscode.Uri.file(tmpXml));
			vscode.workspace.onDidSaveTextDocument(async doc => {
				if (doc === xmlTab.document) {
					await wd.upload(tmpXml, xmlPath);
					await wd.upload(tmpXml, corrXml);
					vscode.window.showInformationMessage("Document was uploaded to server.");
				}
			});
			const pdfPath = path.join(GROBID_IN_DIR, item.model.doi.replace("/","_") + ".pdf");
			const tmpPdf = path.join(os.tmpdir(), path.basename(pdfPath));
			await wd.download(pdfPath, tmpPdf);
			await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(tmpPdf), "pdf.preview",vscode.ViewColumn.Beside);
		}
	} catch (ex) {
		console.error(ex);
		vscode.window.showErrorMessage(ex.message);
	}
}

async function removeLbIndentation() {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const document = editor.document;
		const text = document.getText();
		const lineCount = document.lineCount;
		const range = new vscode.Range(0, 0, lineCount, document.lineAt(lineCount-1).text.length);
		const textEdited = text.replace(/\n\s+<lb \/>/g, "<lb />");
		editor.edit(editBuilder => {
			editBuilder.replace(range, textEdited);
		});
	}
}

async function trainModel(model: string) {
	try {
		await sshExec(`cp ${GROBID_OUT_PATH}/*.${model}.* ${GROBID_TRAINING_DATA_PATH}`);	
		await sshExec(`cd ${GROBID_DIR}; ./gradlew train_${model}`);
	} catch (ex) {
		console.error(ex);
		vscode.window.showErrorMessage(ex.message);
	}
}

async function selectModelToTrain(model: string) {
	try {
		//await sshExec(`cp ${GROBID_OUT_PATH}/*.${model}.* ${GROBID_TRAINING_DATA_PATH}/${}`);	
		//await sshExec(`cd ${GROBID_DIR}; ./gradlew train_${model}`);
	} catch (ex) {
		console.error(ex);
		vscode.window.showErrorMessage(ex.message);
	}
}

export function activate(context: vscode.ExtensionContext) {
	const register = vscode.commands.registerCommand;
	context.subscriptions.push(
		register('grobid-trainer.createTrainingFiles', createTrainingFiles),
		register('grobid-trainer.openTrainingFiles', openTrainingFiles),
		register('grobid-trainer.selectModelToTrain', selectModelToTrain),
		register('grobid-trainer.removeLbIndentation', removeLbIndentation),
	);
}

// this method is called when your extension is deactivated
export function deactivate() {}
