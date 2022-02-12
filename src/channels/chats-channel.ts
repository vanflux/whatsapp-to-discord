import { Message as WaMessage } from "@open-wa/wa-automate";
import { CategoryChannel, Channel } from "discord.js";
import EventEmitter from "events";
import Discord from "../bots/discord";
import Whatsapp from "../bots/whatsapp";
import ChatChannel, { ChatData } from "./chat-channel";

const channelName = '💬Chats💬';

export interface ChatsData {
  chatDatas?: ChatData[];
  channelId?: string;
}

export default class ChatsChannel extends EventEmitter {
  private guildId: string;
  private channel: CategoryChannel|undefined;
  private chatChannels: ChatChannel[] = [];
  private chatsData: ChatsData;
  private ready = false;

  private get channelId() { return this.chatsData.channelId };
  private get chatDatas() { return this.chatsData.chatDatas! };

  private set channelId(value) { this.chatsData.channelId = value };
  private set chatDatas(value) { this.chatsData.chatDatas = value };

  constructor(guildId: string, chatsData: ChatsData) {
    super();
    this.guildId = guildId;

    this.chatsData = chatsData;
    if (this.chatDatas === undefined) this.chatDatas = [];
  }

  public async setup() {
    if (this.ready) return;

    if (this.channelId) await this.loadExistentChannel();
    if (!this.channelId) await this.createNewChannel();

    const topNewChats = await this.getTopNewChats(5);
    this.chatDatas.push(...topNewChats.map(chat => ({ waChatId: chat.id })));
    for (let chatData of this.chatDatas) {
      const chatChannel = new ChatChannel(this.guildId, chatData);
      chatChannel.setup();
      this.addChatChannel(chatChannel);
    }

    if (this.channelId) {
      Whatsapp.client.onAnyMessage(waMessage => this.handleWhatsappAnyMessage(waMessage));
      Discord.client.on('channelDelete', channel => this.handleDiscordChannelDelete(channel));
      Discord.client.on('channelUpdate', (oldChannel, newChannel) => this.handleDiscordChannelUpdate(oldChannel, newChannel));
      this.ready = true;
      this.emit('ready');
    } else {
      this.emit('setup error');
    }
  }

  public getChannelId() {
    return this.channelId;
  }

  private hasWaChatId(waChatId: string) {
    return !!this.chatDatas.find(chatData => chatData.waChatId === waChatId);
  }

  private async getTopNewChats(maxCount: number) {
    const allChats = await Whatsapp.getAllChats();
    const topChats = allChats.slice(0, maxCount);
    const newTopChats = topChats.filter(chat => !this.hasWaChatId(chat.id));
    return newTopChats;
  }
  
  private async addChatChannel(chatChannel: ChatChannel) {
    this.chatChannels.push(chatChannel);
    if (this.ready) {
      if (chatChannel.isReady()) {
        this.sync();
      } else {
        chatChannel.once('ready', () => this.sync());
      }
    } else {
      this.once('ready', () => {
        if (chatChannel.isReady()) {
          this.sync();
        } else {
          chatChannel.once('ready', () => this.sync());
        }
      })
    }
    chatChannel.on('channel changed', () => this.sync());
    chatChannel.on('data changed', () => this.emit('data changed', this.chatsData));
  }

  private async sync() {
    if (!this.ready || !this.channelId) return;
    this.chatChannels.forEach(chatChannel => {
      if (!chatChannel.isReady() || !chatChannel.getChannelId()) return;
      if (chatChannel.getChannel()?.parentId === this.channelId) return;
      console.log('set parent', chatChannel.getChannel()?.name);
      chatChannel.getChannel()?.setParent(this.channel!);
    })
  }

  private async setChannel(channel: CategoryChannel) {
    const changed = this.channel != null;
    this.channel = channel;
    this.channelId = channel.id;
    if (changed) this.emit('channel changed', channel);
    this.emit('data changed', this.chatsData);
  }

  private async loadExistentChannel() {
    const existentChannel = await Discord.getChannel(this.guildId, this.channelId!);
    if (existentChannel?.type === 'GUILD_CATEGORY') {
      this.setChannel(existentChannel);
    } else {
      this.channelId = undefined;
      this.emit('data changed', this.chatsData);
    }
  }

  private async createNewChannel() {
    const channelCreated = await Discord.createChannel(this.guildId, channelName, { type: 'GUILD_CATEGORY' }) as CategoryChannel;
    if (channelCreated) {
      this.setChannel(channelCreated);
      this.sync();
    }
  }

  private async handleWhatsappAnyMessage(waMessage: WaMessage) {
    if (!waMessage.chatId) return;
    if (this.hasWaChatId(waMessage.chatId)) {
      const chatChannel = this.chatChannels.find(chatChannel => chatChannel.getWaChatId() === waMessage.chatId);
      if (chatChannel) {
        const channel = chatChannel.getChannel();
        if (channel) {
          if (channel.position !== 0) {
            await channel.setPosition(0);
          }
        }
      }
    } else {
      const chatData = { waChatId: waMessage.chatId };
      this.chatDatas.push(chatData);
      const chatChannel = new ChatChannel(this.guildId, chatData);
      chatChannel.setup();
      this.addChatChannel(chatChannel);
    }
  }
  
  private async handleDiscordChannelDelete(channel: Channel) {
    if (channel.id !== this.channelId) return;
    await this.createNewChannel();
  }
  
  private async handleDiscordChannelUpdate(oldChannel: Channel, newChannel: Channel) {
    if (oldChannel.id !== this.channelId) return;
    if (newChannel.type !== 'GUILD_CATEGORY') return;
    const newCategoryChannel = newChannel as CategoryChannel;
    if (newCategoryChannel.name != channelName) {
      await this.channel?.setName(channelName);
    }
  }
}
