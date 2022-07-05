import { Message as DcMessage, MessageEmbed, MessageAttachment, TextChannel } from "discord.js";
import { ev } from '@open-wa/wa-automate';
import EventEmitter from "events";
import PersistentChannel from "../persistent-channel";

const channelName = '⚫qr-code⚪';
const channelTopic = 'Qr Code Channel';

export interface QrData {
  channelId?: string;
};

export default class QrChannel extends EventEmitter {
  private persistentChannel: PersistentChannel<TextChannel>;
  private guildId: string;
  private qrData: QrData;
  private ready = false;
  private lastQrCodeTS = 0;
  
  private get channel() { return this.persistentChannel.getChannel() };

  constructor(guildId: string, qrData: QrData) {
    super();
    this.guildId = guildId;
    this.qrData = qrData;
    this.persistentChannel = new PersistentChannel(this.guildId, this.qrData.channelId, () => ({ channelName, options: { type: 'GUILD_TEXT', topic: channelTopic } }));
    this.persistentChannel.on('channel created', this.handleChannelCreated.bind(this));
  }

  public async setup() {
    if (this.ready) return true;
    if (!await this.persistentChannel.setup()) return false;

    ev.on('qr.**', async qrCode => this.handleQrCodeChange(qrCode));

    this.ready = true;
    this.emit('ready');
    return true;
  }

  private handleChannelCreated(newChannelId?: string) {
    this.qrData.channelId = newChannelId;
    this.emit('data changed', this.qrData);
  }

  private async handleQrCodeChange(qrCode: string) {
    const thisQrCodeTS = this.lastQrCodeTS = Date.now();
    if (this.ready) {
      this.sendQrCode(qrCode);
    } else {
      this.once('ready', () => {
        if (this.lastQrCodeTS <= thisQrCodeTS) {
          this.sendQrCode(qrCode);
        }
      });
    }
  }

  private async sendQrCode(qrCode: string) {
    const imageBuffer = Buffer.from(
      qrCode.replace('data:image/png;base64,', ''),
      'base64'
    );
    const attachment = new MessageAttachment(imageBuffer, 'qrcode.png');
    const embed = new MessageEmbed({
      title: 'New QR Code',
      description: 'Scan to log in',
      timestamp: Date.now(),
    });
    embed.setImage('attachment://qrcode.png');
    this.channel?.send({ embeds: [embed], files: [attachment] });
  }
}
