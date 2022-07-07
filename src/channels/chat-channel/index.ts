import { ChatState, Message as WaMessage } from "@open-wa/wa-automate";
import { Message as DcMessage, TextChannel, Interaction, Typing, MessageOptions } from "discord.js"
import Discord from "../../bots/discord";
import Whatsapp, { WaSendMessagePayload } from "../../bots/whatsapp";
import EventEmitter from "events";
import PersistentChannel from "../persistent-channel";
import { descriptionFromChat, nameFromChat, sanitizeChatDescription, sanitizeChatName } from "../../functions";
import RecvMessageHandler from "./recv-message-handler";
import SendMessageHandler from "./send-message-handler";
import InteractionHandler from "./interaction-handler";

const oldMessagesLimit = 5;

export interface ChatData {
  waChatId: string;
  channelId?: string;
  lastMessageTS?: number;
  dcMsgIdAndWaMsgId?: {dcMsgId: string, waMsgId: string}[];
};

export default class ChatChannel extends EventEmitter {
  private guildId: string;
  private channelName: string|undefined;
  private channelTopic: string|undefined;
  private chatData: ChatData;
  private ready = false;
  private persistentChannel: PersistentChannel<TextChannel>;
  private recvMessageHandler: RecvMessageHandler;
  private sendMessageHandler: SendMessageHandler;
  private interactionHandler: InteractionHandler;

  private get waChatId() { return this.chatData.waChatId };
  private get channel() { return this.persistentChannel.getChannel() };
  private get channelId() { return this.persistentChannel.getChannelId() };
  private get lastMessageTS() { return this.chatData.lastMessageTS };
  private get dcMsgIdAndWaMsgId() { return this.chatData.dcMsgIdAndWaMsgId };
  
  private set waChatId(value) { this.chatData.waChatId = value };
  private set lastMessageTS(value) { this.chatData.lastMessageTS = value };
  private set dcMsgIdAndWaMsgId(value) { this.chatData.dcMsgIdAndWaMsgId = value };

  constructor(guildId: string, chatData: ChatData) {
    super();
    this.guildId = guildId;
    this.chatData = chatData;
    if (this.waChatId === undefined) throw new Error('WaChatId is required');
    if (this.lastMessageTS === undefined) this.lastMessageTS = 0;
    if (this.dcMsgIdAndWaMsgId === undefined) this.dcMsgIdAndWaMsgId = [];

    this.persistentChannel = new PersistentChannel(guildId, chatData.channelId, () => ({
      channelName: this.channelName!,
      options: { type: 'GUILD_TEXT', topic: this.channelTopic }
    }));
    this.recvMessageHandler = new RecvMessageHandler(this.getDcMsgIdByWaMsgId.bind(this));
    this.sendMessageHandler = new SendMessageHandler();
    this.interactionHandler = new InteractionHandler(this.getWaMsgIdByDcMsgId.bind(this), this.waChatId);

    this.persistentChannel.on('channel created', this.handleChannelCreated.bind(this));
    this.persistentChannel.on('channel loaded', this.handleChannelLoaded.bind(this));
    this.recvMessageHandler.on('topic change request', this.setTopic.bind(this));
    this.recvMessageHandler.on('name change request', this.setName.bind(this));
    this.recvMessageHandler.on('send message request', ({options, waMsgId}) => this.sendDiscordMessage(options, waMsgId));
    this.sendMessageHandler.on('send message request', this.sendWhatsappMessage.bind(this))
    this.interactionHandler.on('send message request', this.sendWhatsappMessage.bind(this));
  }

  public async setup() {
    if (this.ready) return true;

    const chat = await Whatsapp.getChatById(this.waChatId);
    this.channelName = nameFromChat(chat);
    this.channelTopic = descriptionFromChat(chat);

    if (!await this.persistentChannel.setup()) return false;

    await Whatsapp.onAnyMessage(waMessage => this.handleWhatsappAnyMessage(waMessage));
    await Whatsapp.onChatState(chatState => this.handleWhatsappChatState(chatState));
    await Discord.on('messageCreate', dcMessage => this.handleDiscordMessageCreate(dcMessage));
    await Discord.on('interactionCreate', interaction => this.handleDiscordInteractionCreate(interaction));
    await Discord.on('typingStart', (typing: Typing) => this.handleDiscordTypingStart(typing));

    this.ready = true;
    this.emit('ready');
    return true;
  }

  public isReady() {
    return this.ready;
  }

  public getChannel() {
    return this.channel;
  }

  public getWaChatId() {
    return this.waChatId;
  }

  private getDcMsgIdByWaMsgId(waMsgId: string) {
    return this.dcMsgIdAndWaMsgId?.find(x => x.waMsgId === waMsgId)?.dcMsgId;
  }
  
  private getWaMsgIdByDcMsgId(dcMsgId: string) {
    return this.dcMsgIdAndWaMsgId?.find(x => x.dcMsgId === dcMsgId)?.waMsgId;
  }

  private async handleChannelLoaded(channelId?: string) {
    this.sendNonReceivedMessages();
  }
  
  private async handleChannelCreated(newChannelId?: string) {
    this.chatData.channelId = newChannelId;
    this.dcMsgIdAndWaMsgId = [];
    this.lastMessageTS = 0;
    this.sendNonReceivedMessages();
    this.emit('data changed', this.chatData);
    this.emit('channel changed', newChannelId);
  }

  private async handleWhatsappAnyMessage(waMessage: WaMessage) {
    if (waMessage.chatId !== this.waChatId) return;
    await this.handleWhatsappMessage(waMessage);
  }

  private async handleWhatsappChatState(chatState: ChatState) {
    // Only insiders... I cant test this...
    console.log(`[Whatsapp] ${this.waChatId}: Chat state received:`, chatState);
    /*if (chatState === ChatState.TYPING) {
      this.channel?.sendTyping();
    }*/
  }

  private async handleDiscordMessageCreate(dcMessage: DcMessage) {
    if (dcMessage.author.bot) return;
    if (dcMessage.channelId !== this.channelId) return;
    
    this.lastMessageTS = Date.now();
    this.emit('data changed', this.chatData);

    await this.sendMessageHandler.handle(dcMessage);

    dcMessage.delete();
  }

  private async handleDiscordInteractionCreate(interaction: Interaction) {
    if (interaction.channelId !== this.channelId) return;
    this.interactionHandler.handle(interaction);
  }

  private async handleDiscordTypingStart(typing: Typing) {
    if (typing.channel.id !== this.channelId) return;
    console.log(`[Discord] ${this.waChatId}: You are typing...`);
    Whatsapp.simulateTyping(this.waChatId, true);
  }
  
  private async handleWhatsappMessage(waMessage: WaMessage) {
    const { t } = waMessage;
    this.lastMessageTS = t * 1000;
    this.emit('data changed', this.chatData);

    await this.recvMessageHandler.handle(waMessage);
  }

  // Identifies old messages that were not sent

  private async sendNonReceivedMessages() {
    if (!this.channelId) return;
    let lastMessageTimestamp = await Whatsapp.getLastMessageTimestampByChatId(this.waChatId);
    if (lastMessageTimestamp == null) return;
    const oldLastMessageTimestamp = this.lastMessageTS;
    if (oldLastMessageTimestamp == null) return;
    if (lastMessageTimestamp > oldLastMessageTimestamp) {
      // Get new messages to send
      const newMessages = await Whatsapp.getMessagesAfterTimestampByChatId(this.waChatId, oldLastMessageTimestamp);

      const toSendMessages = newMessages.length <= oldMessagesLimit ? newMessages : newMessages.slice(-oldMessagesLimit);
      // Send
      if (newMessages.length > oldMessagesLimit) {
        console.log(`[Discord] ${this.waChatId}: Too much messages`);
        await this.channel?.send(`[BOT]: Too much messages, only the last ${oldMessagesLimit} are being shown.`);
      }
      for (let message of toSendMessages) {
        try {
          await this.handleWhatsappMessage(message);
        } catch (exc) {
          console.error('send non received msgs, receive whatsapp chat message error', exc);
        }
      }
    }
  }

  // Send message on discord channel

  private async sendDiscordMessage(payload: MessageOptions, waMsgId: string) {
    console.log(`[Whatsapp -> Discord] ${this.waChatId}: Payload=`, JSON.stringify(payload));
    try {
      const dcMessage = await this.channel!.send(payload);
      this.dcMsgIdAndWaMsgId!.unshift({ dcMsgId: dcMessage.id, waMsgId});
      this.emit('dc message sent', dcMessage);
      this.emit('data changed', this.chatData);
    } catch (exc) {
      console.error('Error on sent message to discord', exc);
    }
  }

  // Send message on whatsapp channel
  
  private async sendWhatsappMessage(payload: WaSendMessagePayload) {
    console.log(`[Discord -> Whatsapp] ${this.waChatId}: Payload=`, JSON.stringify(payload));
    try {
      await Whatsapp.sendMessage(this.waChatId, payload);
    } catch (exc) {
      console.error('Error on sent message to discord', exc);
    }
  }
  
  // Set channel topic/description

  private setTopic(topic: string) {
    console.log(`[Whatsapp -> Discord] ${this.waChatId}: Set topic=${topic}`);
    const sanitized = sanitizeChatDescription(topic);
    if (sanitized !== this.channelTopic) {
      this.channel?.setTopic(sanitized);
    }
    this.channelTopic = this.channel?.topic ? this.channel?.topic : undefined;
    return this.channelTopic;
  }

  // Set channel name

  private setName(name: string) {
    console.log(`[Whatsapp -> Discord] ${this.waChatId}: Set name=${name}`);
    const sanitized = sanitizeChatName(name);
    if (sanitized !== this.channelName) {
      this.channel?.setName(sanitized);
    }
    this.channelName = this.channel?.name;
    return this.channelName;
  }
}
