import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import {WebDav} from './webdavUtils';
import {FileStat} from 'webdav';

const WEBDAV_URL = "http://c102-167.cloud.gwdg.de/webdav";
const WEBDAV_USER = "zfrsoz";
const WEBDAV_PASSWD = "coping-lifeboat-unimodal-synoptic";
const GROBID_IN_DIR = "GROBID-IN";
const GROBID_OUT_DIR = "GROBID-OUT";

async function openTrainingFiles() {
	try {
		const wd = new WebDav(WEBDAV_URL, WEBDAV_USER, WEBDAV_PASSWD);
		const client = wd.getClient();
		const filestats = (await client.getDirectoryContents(GROBID_OUT_DIR)) as FileStat[];
		const filenames: string[] = filestats
			.filter(filestat => filestat.type === "file")
			.map(filestat => filestat.filename)
			.map(filename => filename.replace("/"+GROBID_OUT_DIR+"/",""))
			.sort();
		
		type TrainingFileModel = {
			filename: string,
			doi: string,
			type: string
		};
	
		const extract = (filename: string, regExp: RegExp): string => {
			let match = filename.match(regExp);
			return match ? match[1] : `No match for ${regExp.toString()}`;
		};
	
		const trainingFileModels: TrainingFileModel[] = filenames
			.filter(filename => filename.endsWith("tei.xml"))
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
	context.subscriptions.push(vscode.commands.registerCommand('grobid-trainer.openTrainingFiles', openTrainingFiles));
}

// this method is called when your extension is deactivated
export function deactivate() {}
