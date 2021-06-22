import {createClient, WebDAVClient} from 'webdav';
import { setXattr, removeXattr } from 'node-xattr';
import * as fs from "fs";
import * as path from "path";
import * as os from 'os';

export class WebDav {

  protected client: WebDAVClient;

  constructor(endpoint: string, username: string, password: string) {
    this.client = createClient(endpoint, {username,password});
  }

  getClient() : WebDAVClient {
      return this.client;
  }

  /**
   * Downloads a file from the webdav endpoint
   * @param {String} fileName
   * @param {String} targetPath
   * @returns {Promise<void>}
   */
  async download(fileName: string, targetPath:string) : Promise<void> {
    console.log(`Downloading ${fileName}`);
    await new Promise<void>( (resolve, reject) => {
      this.client
        .createReadStream(fileName)
        .on('error', reject)
        .pipe(fs.createWriteStream(targetPath))
        .on('close', async () =>  {
          try {
            await removeXattr(targetPath, "com.apple.quarantine");
          } catch(e) {
            console.error(e);
          }
          resolve();
        })
        .on('error', reject);
    });
  }

  /**
   * uploads to the webdav endpoint
   * @param sourcePath
   * @param fileName
   */
  async upload(sourcePath: string, fileName?: string) : Promise<void> {
    if (!fileName) {
      fileName = path.basename(sourcePath);
    }
    console.log(`Uploading ${fileName}`);
    await new Promise( (resolve, reject) => {
      fs.createReadStream(sourcePath)
        .on('error', reject)
        .pipe(this.client.createWriteStream(fileName as string))
        .on('finish', resolve)
        .on('error', reject);
    });
  }

}

