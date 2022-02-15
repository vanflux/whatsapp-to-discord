import { Message as DcMessage, TextChannel, Channel, MessageEmbed, MessageAttachment } from "discord.js";
import { ev } from '@open-wa/wa-automate';
import Discord from "../bots/discord";
import EventEmitter from "events";

const channelName = '⚫qr-code⚪';
const channelTopic = 'Qr Code Channel';

export interface QrData {
  channelId?: string;
};

export default class QrChannel extends EventEmitter {
  private guildId: string;
  private channel: TextChannel|undefined;
  private qrData: QrData;
  private ready = false;
  private lastQrCodeTS = 0;
  
  private get channelId() { return this.qrData.channelId };
  
  private set channelId(value) { this.qrData.channelId = value };

  constructor(guildId: string, qrData: QrData) {
    super();
    this.guildId = guildId;
    this.qrData = qrData;
  }

  public async setup() {
    if (this.ready) return;

    if (this.channelId) await this.loadExistentChannel();
    if (!this.channelId) await this.createNewChannel();

    if (this.channelId) {
      ev.on('qr.**', async qrCode => this.handleQrCodeChange(qrCode));
      await Discord.on('channelDelete', channel => this.handleDiscordChannelDelete(channel));

      this.ready = true;
      this.emit('ready');
    } else {
      this.emit('setup error');
    }
  }

  public isReady() {
    return this.ready;
  }

  public getChannelId() {
    return this.channelId;
  }
  
  public getChannel() {
    return this.channel;
  }

  public getQrData() {
    return this.qrData;
  }

  private async setChannel(channel: TextChannel) {
    const changed = this.channel != null;
    this.channel = channel;
    this.channelId = channel.id;
    if (changed) this.emit('channel changed', channel);
    this.emit('data changed', this.qrData);
  }

  private async loadExistentChannel() {
    const existentChannel = await Discord.getChannel(this.guildId, this.channelId!);
    if (existentChannel?.type === 'GUILD_TEXT') {
      this.setChannel(existentChannel);
    } else {
      this.channelId = undefined;
      this.emit('data changed', this.qrData);
    }
  }

  private async createNewChannel() {
    const channelCreated = await Discord.createChannel(this.guildId, channelName, { type: 'GUILD_TEXT', topic: channelTopic }) as TextChannel;
    if (channelCreated) {
      this.emit('data changed', this.qrData);
      this.setChannel(channelCreated);
    }
  }

  private async handleDiscordChannelDelete(channel: Channel) {
    if (channel.id !== this.channelId) return;
    await this.createNewChannel();
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
