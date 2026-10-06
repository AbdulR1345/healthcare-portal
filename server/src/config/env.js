import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "../../../.env");
const serverEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: rootEnvPath, quiet: true });
dotenv.config({ path: serverEnvPath, quiet: true });
