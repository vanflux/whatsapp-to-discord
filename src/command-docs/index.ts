import { readdirSync } from "fs";
import { join } from "path";
import { APIApplicationGuildCommand } from "../bots/discord";

export default function getCommandDocs(): APIApplicationGuildCommand[] {
  return readdirSync(__dirname)
    .filter(x => !x.match(/index\.(js|ts)/))
    .map(x => require(join(__dirname, x))?.default)
    .filter(x => typeof x === 'function')
    .map(x => x());
}
