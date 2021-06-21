import {createClient, WebDAVClient} from 'webdav';
import * as fs from "fs";
import * as path from "path";

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
    await new Promise( (resolve, reject) => {
      this.client
        .createReadStream(fileName)
        .on('error', reject)
        .pipe(fs.createWriteStream(targetPath))
        .on('finish', resolve)
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
    await new Promise( (resolve, reject) => {
      fs.createReadStream(sourcePath)
        .on('error', reject)
        .pipe(this.client.createWriteStream(fileName as string))
        .on('finish', resolve)
        .on('error', reject);
    });
  }

}

