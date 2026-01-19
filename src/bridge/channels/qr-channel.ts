import EventEmitter from "events";
import { PersistentChannel } from "./persistent-channel";
import { Discord } from "../../discord";
import QRCode from 'qrcode';
import { Whatsapp } from "../../whatsapp";
import { DiscordChannelType } from "../../discord/types/channel-type";
import { Logger } from "pino";

const channelName = '⚫qr-code⚪';
const channelTopic = 'Qr Code Channel';

export interface QrChannelData {
    channelId?: string;
};

export class QrChannel extends EventEmitter {
    private persistentChannel: PersistentChannel;
    private guildId: string;
    private ready = false;
    private lastQrCodeTS = 0;

    constructor(private logger: Logger, private discord: Discord, private whatsapp: Whatsapp, guildId: string, private data: QrChannelData) {
        super();
        this.guildId = guildId;
        this.persistentChannel = new PersistentChannel(discord, this.guildId, this.data.channelId, () => ({ name: channelName, topic: channelTopic, type: DiscordChannelType.TEXT }));
        this.persistentChannel.on('channelCreated', this.handleChannelCreated.bind(this));
    }

    public async setup() {
        if (this.ready) return true;
        this.whatsapp.on('qr', qr => this.handleQrCodeChange(qr));
        await this.persistentChannel.setup();
        this.ready = true;
        this.emit('ready');
        return true;
    }

    private handleChannelCreated(newChannelId?: string) {
        this.data.channelId = newChannelId;
        this.emit('dataChanged', this.data);
    }

    private async handleQrCodeChange(qr: string) {
        const thisQrCodeTS = this.lastQrCodeTS = Date.now();
        if (this.ready) {
            this.sendQrCode(qr);
        } else {
            this.once('ready', () => {
                if (this.lastQrCodeTS <= thisQrCodeTS) {
                    this.sendQrCode(qr);
                }
            });
        }
    }

    private async sendQrCode(qr: string) {
        if (!this.data.channelId) return;
        const buffer = await QRCode.toBuffer(qr);
        await this.discord.sendMessage(this.data.channelId, {
            embeds: [
                {
                    title: 'New QR Code',
                    description: 'Scan to log in',
                    timestamp: new Date(),
                    image: {
                        data: buffer,
                        filename: 'qrcode.png'
                    },
                }
            ],
            files: [],
        });
    }
}
