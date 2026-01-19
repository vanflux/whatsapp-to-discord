import EventEmitter from "events";
import { Discord } from "../../discord";
import { DiscordCreateChannel } from "../../discord/types/create-channel";
import { DiscordChannelType } from "../../discord/types/channel-type";
import { sleep } from "../../functions";

export interface PersistentChannelData {
  channelId: string|undefined;
}

export type ChannelCreationOptionsSupplier = () => Omit<DiscordCreateChannel, 'guildId'>;

interface PersistentChannelEvents {
  'ready': () => void;
  'channelCreated': (channelId: string) => void;
}

export declare interface PersistentChannel {
  on<U extends keyof PersistentChannelEvents>(
    event: U, listener: PersistentChannelEvents[U]
  ): this;
  emit<U extends keyof PersistentChannelEvents>(
    event: U, ...args: Parameters<PersistentChannelEvents[U]>
  ): boolean;
}

export class PersistentChannel extends EventEmitter {
  private ready = false;
  private initialization?: Promise<void>;
  
  constructor(
    private discord: Discord,
    private guildId: string,
    private channelId: string | undefined,
    private buildChannelCreationOpts: ChannelCreationOptionsSupplier,
  ) {
    super();
  }

  private async _setup() {
    this.discord.on('channelDelete', this.handleDiscordChannelDelete.bind(this));
    this.discord.on('channelUpdate', this.handleDiscordChannelUpdate.bind(this));
    await this.sync();
    this.ready = true;
    this.emit('ready');
  }

  public async setup() {
    await this.initialization;
    if (this.ready) return;
    this.initialization = this._setup();
    await this.initialization;
  }

  public isReady() {
    return this.ready;
  }

  public getChannelId() {
    return this.channelId;
  }

  private async sync() {
    const existentChannel = this.channelId ? await this.discord.getChannel(this.channelId) : undefined;
    const options = this.buildChannelCreationOpts();
    if (existentChannel) {
      const expectedType = options.type;
      const currentType = existentChannel.type;
      const shouldDelete = expectedType !== undefined && expectedType !== currentType;
      if (shouldDelete) {
        console.log('Deleting channel:', existentChannel);
        await this.discord.deleteChannel({
          guildId: this.guildId,
          channelId: existentChannel.channelId,
        });
      } else {
        const expectedName = options.name;
        const currentName = existentChannel.name;
        const expectedTopic = options.topic;
        const currentTopic = existentChannel.topic;
        const expectedParentId = options.parentId;
        const currentParentId = existentChannel.parentId;
        const shouldUpdate = (
          (expectedName !== undefined && expectedName !== currentName) ||
          (expectedTopic !== undefined && expectedTopic !== currentTopic) ||
          (expectedParentId !== undefined && expectedParentId !== currentParentId)
        );
        if (shouldUpdate) {
          console.log('Updating channel:', existentChannel, 'with options:', options);
          await sleep(2000);
          await this.discord.updateChannel({
            name: options.name,
            topic: options.topic,
            parentId: options.parentId,
            channelId: existentChannel.channelId,
            guildId: this.guildId,
          });
        }
      }
    } else {
      const channelId = await this.discord.createChannel({ ...options, guildId: this.guildId });
      this.channelId = channelId;
      this.emit('channelCreated', this.channelId);
    }
  }

  private async handleDiscordChannelDelete(channelId: string) {
    if (channelId !== this.channelId) return;
    await this.sync();
  }

  private async handleDiscordChannelUpdate(channelId: string) {
    if (channelId !== this.channelId) return;
    await this.sync();
  }
}
