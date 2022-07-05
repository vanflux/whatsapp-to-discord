import { Channel, GuildChannelCreateOptions } from "discord.js";
import EventEmitter from "events";
import Discord from "./bots/discord";

export interface PersistentChannelData {
  channelId: string|undefined;
}

export type ChannelCreationOptionsSupplier = () => { channelName: string; options: GuildChannelCreateOptions };

interface PersistentChannelEvents {
  'ready': () => void;
  'channel changed': (channelId?: string) => void;
  'channel created': (channelId?: string) => void;
  'channel loaded': (channelId?: string) => void;
}

declare interface PersistentChannel<T extends Channel> {
  on<U extends keyof PersistentChannelEvents>(
    event: U, listener: PersistentChannelEvents[U]
  ): this;
  emit<U extends keyof PersistentChannelEvents>(
    event: U, ...args: Parameters<PersistentChannelEvents[U]>
  ): boolean;
}

class PersistentChannel<T extends Channel> extends EventEmitter {
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

    await Discord.on('channelDelete', this.handleDiscordChannelDelete.bind(this));

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

  private async loadExistentChannel() {
    let existentChannel = await Discord.getChannel(this.guildId, this.channelId!) as T|undefined;
    const { options: { type: channelType } } = this.buildChannelCreationOpts();
    if (existentChannel?.type !== (channelType || 'GUILD_TEXT')) existentChannel = undefined;
    this.channel = existentChannel;
    this.channelId = existentChannel?.id;
    this.emit('channel changed', this.channelId);
    this.emit('channel loaded', this.channelId);
  }

  private async createNewChannel() {
    const { channelName, options } = this.buildChannelCreationOpts();
    const channelCreated = await Discord.createChannel(this.guildId, channelName, options) as T|undefined;
    this.channel = channelCreated;
    this.channelId = channelCreated?.id;
    this.emit('channel changed', this.channelId);
    this.emit('channel created', this.channelId);
  }

  private async handleDiscordChannelDelete(channel: Channel) {
    if (channel.id !== this.channelId) return;
    await this.createNewChannel();
  }
}

export default PersistentChannel;
