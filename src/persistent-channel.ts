import { Channel, GuildChannelCreateOptions } from "discord.js";
import EventEmitter from "events";
import Discord from "./bots/discord";

export interface PersistentChannelData {
  channelId: string|undefined;
}

export type ChannelCreationOptionsSupplier = () => { channelName: string; options: GuildChannelCreateOptions };

export default class PersistentChannel<T extends Channel> extends EventEmitter {
  private guildId: string;
  private channel: T|undefined;
  private ready = false;
  private channelId: string|undefined;
  private buildChannelCreationOpts: ChannelCreationOptionsSupplier;
  
  constructor(guildId: string, channelId: string|undefined, buildChannelCreationOpts: ChannelCreationOptionsSupplier) {
    super();
    this.guildId = guildId;
    this.channelId = channelId;
    this.buildChannelCreationOpts = buildChannelCreationOpts;
  }

  public async setup() {
    if (this.ready) return true;
    
    if (this.channelId) await this.loadExistentChannel();
    if (!this.channelId) await this.createNewChannel();
    if (!this.channelId) return false;

    await Discord.on('channelDelete', channel => this.handleDiscordChannelDelete(channel));

    this.ready = true;
    this.emit('ready');
    return true;
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

  private async setChannel(channel: T) {
    const changed = this.channelId != channel.id;
    this.channel = channel;
    this.channelId = channel.id;
    if (changed) this.emit('channel changed', this.channelId);
  }

  private async loadExistentChannel() {
    const existentChannel = await Discord.getChannel(this.guildId, this.channelId!) as T|undefined;
    const { options: { type: channelType } } = this.buildChannelCreationOpts();
    if (existentChannel?.type === (channelType || 'GUILD_TEXT')) {
      this.setChannel(existentChannel);
    } else {
      this.channelId = undefined;
      this.emit('channel changed', undefined);
    }
  }

  private async createNewChannel() {
    const { channelName, options } = this.buildChannelCreationOpts();
    const channelCreated = await Discord.createChannel(this.guildId, channelName, options) as T|undefined;
    if (!channelCreated) return;
    this.setChannel(channelCreated);
  }

  private async handleDiscordChannelDelete(channel: Channel) {
    if (channel.id !== this.channelId) return;
    await this.createNewChannel();
  }
}
