// Unzip Zigbee2MQTT's backup in the browser; keep only the text files the import reads
import {unzipSync} from "fflate";
const WANTED = /(^|\/)(configuration\.yaml|database\.db|coordinator_backup\.json|[\w.-]+\.yaml)$/;
export async function readBackupZip(file) {
  if (!/\.zip$/i.test(file.name)) throw new Error("That isn't a zip file. Pick the zip Zigbee2MQTT downloaded.");
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {filter: entry => WANTED.test(entry.name)}), decoder = new TextDecoder(), files = {};
  for (const [name, bytes] of Object.entries(entries)) files[name] = decoder.decode(bytes);
  return files;
}
