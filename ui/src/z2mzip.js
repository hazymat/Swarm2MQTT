// Zigbee2MQTT's files from the browser: its backup zip, or the files themselves from its data folder. Only the text files the import reads are kept.
import {unzipSync} from "fflate";
const WANTED = /(^|\/)(configuration\.yaml|database\.db|coordinator_backup\.json|[\w.-]+\.yaml)$/;
export async function readBackupFiles(fileList) {
  const decoder = new TextDecoder(), files = {};
  for (const file of Array.from(fileList)) {
    if (/\.zip$/i.test(file.name)) {for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(await file.arrayBuffer()), {filter: entry => WANTED.test(entry.name)}))) files[name] = decoder.decode(bytes)}
    else if (WANTED.test(file.name)) files[file.name] = await file.text();
  }
  if (!Object.keys(files).length) throw new Error("None of those are Zigbee2MQTT's files. Drop configuration.yaml, database.db and coordinator_backup.json, or a zip of its data folder.");
  return files;
}
export const readBackupZip = file => readBackupFiles([file]);
