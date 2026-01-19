import 'dotenv/config';
import { Whatsapp } from './whatsapp';
import { Discord } from './discord';
import { Bridge } from './bridge';
import { resolve } from 'node:path';
import pino from 'pino';

async function main() {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) throw new Error('DISCORD_GUILD_ID undefined')
    const discordToken = process.env.DISCORD_TOKEN;
    if (!discordToken) throw new Error('DISCORD_TOKEN undefined')

    const logger = pino({ level: 'debug' });
    const dataPath = resolve(__dirname, '../.data');
    const whatsappPath = resolve(dataPath, 'whatsapp');
    const bridgePath = resolve(dataPath, 'bridge');

    const discord = new Discord(logger.child({ context: 'Discord' }), discordToken);
    const whatsapp = new Whatsapp(logger.child({ context: 'Whatsapp' }), whatsappPath);
    const bridge = new Bridge(logger.child({ context: 'Bridge' }), bridgePath, guildId, whatsapp, discord);
    bridge.start();
}

main();
