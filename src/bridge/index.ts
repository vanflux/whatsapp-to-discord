import { resolve } from "node:path";
import { Discord } from "../discord";
import { Whatsapp } from "../whatsapp";
import { QrChannel, QrChannelData } from "./channels/qr-channel";
import { ChatsChannel, ChatsChannelData } from "./channels/chats-channels";
import { Storage } from "../utils/storage";
import { Logger } from "pino";

export class Bridge {
    private discordQrChannelPath = resolve(this.path, 'qrChannel.json');
    private discordChatsChannelPath = resolve(this.path, 'chatsChannel.json');
    private qrChannelStorage = new Storage<QrChannelData>(this.discordQrChannelPath, {});
    private chatsChannelStorage = new Storage<ChatsChannelData>(this.discordChatsChannelPath, { channels: [], messageMapping: {} });

    constructor(
        private logger: Logger,
        private path: string,
        private guildId: string,
        private whatsapp: Whatsapp,
        private discord: Discord,
    ) {}

    async start() {
        const qrChannel = new QrChannel(this.logger.child({ context: 'QrChannel' }), this.discord, this.whatsapp, this.guildId, this.qrChannelStorage.data);
        qrChannel.on('dataChanged', () => this.qrChannelStorage.save());
        await qrChannel.setup();
        const chatsChannel = new ChatsChannel(this.logger.child({ context: 'ChatsChannel' }), this.discord, this.whatsapp, this.guildId, this.chatsChannelStorage.data);
        chatsChannel.on('dataChanged', () => this.chatsChannelStorage.save());
        await chatsChannel.setup();

        // this.whatsapp.on('message', async ({ sender, recipient, fromMe, text, raw }) => {
        //     if (sender && recipient && text) {
        //         await this.discord.sendEmbed('1461898208392380622', {
        //             author: {
        //                 iconUrl: sender.profilePictureUrl,
        //                 name: sender.name,
        //             },
        //             color: fromMe ? 'Green' : 'Grey',
        //             title: recipient.name,
        //             description: text,
        //         });
        //     }
        // });
    }
}
