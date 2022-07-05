import { Message as WaMessage } from "@open-wa/wa-automate";
import { CategoryChannel } from "discord.js";
import EventEmitter from "events";
import Whatsapp from "../bots/whatsapp";
import PersistentChannel from "../persistent-channel";
import ChatChannel, { ChatData } from "./chat-channel";

const channelName = '💬Chats💬';

export interface ChatsData {
  chatDatas?: ChatData[];
  channelId?: string;
}

export default class ChatsChannel extends EventEmitter {
  private guildId: string;
  private chatChannels: ChatChannel[] = [];
  private chatsData: ChatsData;
  private ready = false;
  private persistentChannel: PersistentChannel<CategoryChannel>;

  private get channel() { return this.persistentChannel.getChannel() };
  private get chatDatas() { return this.chatsData.chatDatas! };

  private set chatDatas(value) { this.chatsData.chatDatas = value };

  constructor(guildId: string, chatsData: ChatsData) {
    super();
    this.setMaxListeners(0);
    this.guildId = guildId;

    this.chatsData = chatsData;
    if (this.chatDatas === undefined) this.chatDatas = [];
      
    this.persistentChannel = new PersistentChannel(this.guildId, this.chatsData.channelId, () => ({ channelName, options: { type: 'GUILD_CATEGORY' } }));
    this.persistentChannel.on('channel changed', this.handleChannelChanged.bind(this));
  }

  public async setup() {
    if (this.ready) return true;
    if (!await this.persistentChannel.setup()) return false;

    const topNewChats = await this.getTopNewChats(5);
    this.chatDatas.push(...topNewChats.map(chat => ({ waChatId: chat.id })));
    for (let chatData of this.chatDatas) {
      const chatChannel = new ChatChannel(this.guildId, chatData);
      chatChannel.setup();
      this.addChatChannel(chatChannel);
    }

    await Whatsapp.onAnyMessage(waMessage => this.handleWhatsappAnyMessage(waMessage));
    this.ready = true;
    this.emit('ready');
    return true;
  }

  public async addNewChat(waChatId: string) {
    const chatData = { waChatId };
    this.chatDatas.push(chatData);
    const chatChannel = new ChatChannel(this.guildId, chatData);
    chatChannel.setup();
    this.addChatChannel(chatChannel);
  }

  public chatAlreadyAdded(waChatId: string) {
    return this.chatDatas.some(x => x.waChatId == waChatId);
  }
  
  public async chatExists(waChatId: string) {
    return await Whatsapp.getChatById(waChatId);
  }

  private handleChannelChanged(newChannelId?: string) {
    this.chatsData.channelId = newChannelId;
    this.sync();
    this.emit('data changed', this.chatsData);
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
    if (!this.ready || !this.channel) return;
    this.chatChannels.forEach(chatChannel => {
      if (
        !chatChannel.isReady()
        || !chatChannel.getChannel()
        || chatChannel.getChannel()?.parentId === this.channel!.id
      ) return;
      console.log('set parent', chatChannel.getChannel()?.name);
      chatChannel.getChannel()?.setParent(this.channel!);
    })
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
}
