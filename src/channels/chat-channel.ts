import { decryptMedia, Message as WaMessage, MessageTypes } from "@open-wa/wa-automate";
import { ButtonInteraction, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed, Message as DcMessage, TextChannel, Interaction, Channel } from "discord.js"
import { extension } from "mime-types";
import FileConverter from "../converters/file-converter";
import Webp2Gif from "../converters/webp-2-gif";
import Discord from "../bots/discord";
import Whatsapp from "../bots/whatsapp";
import { ChannelTypes } from "discord.js/typings/enums";
import EventEmitter from "events";

const oldMessagesLimit = 5;

export interface ChatData {
  waChatId: string;
  channelId?: string;
  lastMessageTS?: number;
  dcMsgIdAndWaMsgId?: {[dcMsgId: string]: string};
};

export default class ChatChannel extends EventEmitter {
  private guildId: string;
  private channel: TextChannel|undefined;
  private channelName: string|undefined;
  private chatData: ChatData;
  private ready = false;
  
  private get waChatId() { return this.chatData.waChatId };
  private get channelId() { return this.chatData.channelId };
  private get lastMessageTS() { return this.chatData.lastMessageTS };
  private get dcMsgIdAndWaMsgId() { return this.chatData.dcMsgIdAndWaMsgId };
  
  private set waChatId(value) { this.chatData.waChatId = value };
  private set channelId(value) { this.chatData.channelId = value };
  private set lastMessageTS(value) { this.chatData.lastMessageTS = value };
  private set dcMsgIdAndWaMsgId(value) { this.chatData.dcMsgIdAndWaMsgId = value };

  constructor(guildId: string, chatData: ChatData) {
    super();
    this.guildId = guildId;
    this.chatData = chatData;
    if (this.waChatId === undefined) throw new Error('WaChatId is required');
    if (this.lastMessageTS === undefined) this.lastMessageTS = 0;
    if (this.dcMsgIdAndWaMsgId === undefined) this.dcMsgIdAndWaMsgId = {};
  }

  public async setup() {
    if (this.ready) return;

    const chat = await Whatsapp.getChatById(this.waChatId);
    this.channelName = chat.name || chat.formattedTitle;

    if (this.channelId) await this.loadExistentChannel();
    if (!this.channelId) await this.createNewChannel();

    if (this.channelId) {
      Whatsapp.client.onAnyMessage(waMessage => this.handleWhatsappAnyMessage(waMessage));
      Discord.client.on('messageCreate', dcMessage => this.handleDiscordMessageCreate(dcMessage));
      Discord.client.on('interactionCreate', interaction => this.handleDiscordInteractionCreate(interaction));
      Discord.client.on('channelDelete', channel => this.handleDiscordChannelDelete(channel));
      Discord.client.on('channelUpdate', (oldChannel, newChannel) => this.handleDiscordChannelUpdate(oldChannel, newChannel));
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

  public getWaChatId() {
    return this.waChatId;
  }

  public getChatData() {
    return this.chatData;
  }

  private async setChannel(channel: TextChannel) {
    const changed = this.channel != null;
    this.channel = channel;
    this.channelId = channel.id;
    this.channelName = channel.name;
    if (changed) this.emit('channel changed', channel);
    this.emit('data changed', this.chatData);
  }

  private async loadExistentChannel() {
    const existentChannel = await Discord.getChannel(this.guildId, this.channelId!);
    if (existentChannel?.type === 'GUILD_TEXT') {
      this.setChannel(existentChannel);
      this.sendNonReceivedMessages();
    } else {
      this.channelId = undefined;
      this.dcMsgIdAndWaMsgId = {};
      this.lastMessageTS = 0;
      this.emit('data changed', this.chatData);
    }
  }

  private async createNewChannel() {
    const channelCreated = await Discord.createChannel(this.guildId, this.channelName || 'unnamed-chat', { type: 'GUILD_TEXT' }) as TextChannel;
    if (channelCreated) {
      this.dcMsgIdAndWaMsgId = {};
      this.lastMessageTS = 0;
      this.emit('data changed', this.chatData);
      this.setChannel(channelCreated);
      this.sendNonReceivedMessages();
    }
  }

  private async handleWhatsappAnyMessage(waMessage: WaMessage) {
    if (waMessage.chatId !== this.waChatId) return;
    await this.receiveWhatsappChatMessage(waMessage);
  }

  private async handleDiscordMessageCreate(dcMessage: DcMessage) {
    if (dcMessage.author.bot) return;
    if (dcMessage.channelId !== this.channelId) return;
    await this.sendWhatsappMessage(dcMessage);
  }

  private async handleDiscordInteractionCreate(interaction: Interaction) {
    if (this.channelId !== interaction.channelId || !interaction.isButton) return;

    const buttonInteraction = interaction as ButtonInteraction;
    const type = buttonInteraction.customId;
    const messageId = this.dcMsgIdAndWaMsgId![buttonInteraction.message.id];
    await buttonInteraction.deferUpdate();
    const waMessage = await Whatsapp.getMessageById(messageId);
    if (waMessage) {
      const profilePictureUrl = waMessage.sender?.profilePicThumbObj?.img;
      const senderName = waMessage.sender.formattedName;
      const fileBuffer = await decryptMedia(waMessage);
      switch(type) {
        case 'load_animated_sticker': {
          const fileName = `Sticker_Received_${this.nowDateStr()}.gif`;
          
          const start = Date.now();
          const buf = await Webp2Gif.convert(fileBuffer!);
          const end = Date.now();
          console.log('Webp -> Gif conversion time:', end-start, 'output buffer size', buf!.length);
          
          const attachment = new MessageAttachment(buf!, fileName);
          const embed = new MessageEmbed();
          embed.setAuthor({ iconURL: profilePictureUrl, name: senderName });
          embed.setColor(waMessage.fromMe ? 'GREEN' : 'GREY');
          embed.setImage(`attachment://${fileName}`);
          await buttonInteraction.editReply({ embeds: [embed], files: [attachment], components: [] });
          break;
        }
        case 'load_video': {
          if (waMessage.mimetype) {
            const fileExtension = extension(waMessage.mimetype);
            const fileName = `Video_Received_${this.nowDateStr()}.${fileExtension}`;
            const attachment = new MessageAttachment(fileBuffer!, fileName);
            await buttonInteraction.editReply({ embeds: [], files: [attachment], components: [] });
          }
          break;
        }
        default:
          console.log('Unhandled button interaction', type, messageId);
          break;
      }
    } else {
      await buttonInteraction.editReply('WA Message not found');
    }
  }

  private async handleDiscordChannelDelete(channel: Channel) {
    if (channel.id !== this.channelId) return;
    await this.createNewChannel();
  }
  
  private async handleDiscordChannelUpdate(oldChannel: Channel, newChannel: Channel) {
    if (oldChannel.id !== this.channelId) return;
    if (oldChannel.type !== 'GUILD_TEXT') return;
    if (newChannel.type === 'GUILD_NEWS') await this.channel?.setType({ 'GUILD_TEXT': ChannelTypes.GUILD_TEXT }, 'WA Chat cannot be news channel');
    const newTextChannel = newChannel as TextChannel;
    if (this.channelName && newTextChannel.name != this.channelName) {
      await this.channel?.setName(this.channelName);
    }
  }

  private async sendWhatsappMessage(dcMessage: DcMessage) {
    console.log(`[Discord -> Whatsapp] ${this.waChatId}: ${dcMessage.content}`);
    this.lastMessageTS = Date.now();
    this.emit('data changed', this.chatData);

    let contentSent = false;

    for (let attachment of dcMessage.attachments.values()) {
      const { name, contentType, url, description, id } = attachment;
      const type = contentType?.split('/')[0];
      switch (type) {
        case 'image': {
          const ext = contentType?.split('/')[1];
          if (await Whatsapp.sendImageMessageByUrl(this.waChatId, `image.${ext}`, url, contentSent ? '' : dcMessage.content) != null) {
            contentSent = true;
          } else {
            console.error('Error on send attachment to whatsapp', id, name, contentType, description, url);
          }
        }
      }
    }

    if (!contentSent) await Whatsapp.sendTextMessage(this.waChatId, dcMessage.content);
    dcMessage.delete();
  }

  private async receiveWhatsappChatMessage(waMessage: WaMessage) {
    const { id, chatId, sender, fromMe, text, t, type, mimetype, isAnimated, body } = waMessage;
    console.log(`[Whatsapp -> Discord] ${chatId}: ${text}`);
    const senderName = sender.formattedName;
    this.lastMessageTS = t * 1000;
    this.emit('data changed', this.chatData);

    const profilePictureUrl = sender?.profilePicThumbObj?.img;
    const fileFormat = mimetype && mimetype.includes('/') ? mimetype.split('/')[1].split(';')[0] : undefined;
    const fileExtension = mimetype ? extension(mimetype) : undefined;
    const hasFile = mimetype && fileFormat;
    const fileBuffer = hasFile ? await decryptMedia(waMessage) : undefined;
    const originalFileName = hasFile ? `${t}.${extension(mimetype)}` : undefined;

    const embeds: MessageEmbed[] = [];
    const files: MessageAttachment[] = [];
    const components: MessageActionRow[] = [];

    const embed = new MessageEmbed();
    embed.setAuthor({ iconURL: profilePictureUrl, name: senderName });
    embed.setColor(fromMe ? 'GREEN' : 'GREY');
    switch (type) {
      case MessageTypes.TEXT:
        embed.setDescription(text);
        embeds.push(embed);
        break;
      case MessageTypes.AUDIO:
        if (hasFile) {
          const fileName = `Audio_Received_${this.nowDateStr()}.mp3`;
          const buf = await FileConverter.convert(fileBuffer!, fileFormat, 'mp3');
          const attachment = new MessageAttachment(buf!, fileName);
          files.push(attachment);
        }
        break;
      case MessageTypes.DOCUMENT:
        console.log('receive whatsapp message document');
        break;
      case MessageTypes.IMAGE:
        if (hasFile) {
          const fileName = `Image_Received_${this.nowDateStr()}.${fileExtension}`;
          const attachment = new MessageAttachment(fileBuffer!, fileName);
          files.push(attachment);
          embed.setImage(`attachment://${fileName}`);
          embeds.push(embed);
        }
        embed.setDescription(text);
        if (embeds.length === 0 && text != null && text.length > 0) {
          embeds.push(embed);
        }
        break;
      case MessageTypes.LOCATION:
        console.log('receive whatsapp message location');
        break;
      case MessageTypes.STICKER:
        if (hasFile) {
          if (isAnimated) {
            const btn = new MessageButton({ customId: 'load_animated_sticker', style: 'PRIMARY', label: 'Load sticker' });
            components.push(new MessageActionRow({ components: [btn] }));
            embed.setDescription('[Animated sticker]');
            embeds.push(embed);
          } else {
            const fileName = `Sticker_Received_${this.nowDateStr()}.${fileExtension}`;
            const attachment = new MessageAttachment(fileBuffer!, fileName);
            files.push(attachment);
            embed.setImage(`attachment://${fileName}`);
            embeds.push(embed);
          }
        }
        break;
      case MessageTypes.VIDEO:
        if (hasFile) {
          // @ts-ignore
          if (waMessage.isGif) {
            const fileName = `Gif_Received_${this.nowDateStr()}.gif`;
            const buf = await FileConverter.convert(fileBuffer!, fileFormat, 'gif');
            const attachment = new MessageAttachment(buf!, fileName);
            files.push(attachment);
            embed.setImage(`attachment://${fileName}`);
            embeds.push(embed);
          } else {
            const btn = new MessageButton({ customId: 'load_video', style: 'PRIMARY', label: 'Load video' });
            components.push(new MessageActionRow({ components: [btn] }));
            embed.setDescription('[Video]');
            embeds.push(embed);
          }
        }
        embed.setDescription(text);
        if (embeds.length === 0 && text != null && text.length > 0) {
          embeds.push(embed);
        }
        break;
      case MessageTypes.VOICE:
        if (hasFile) {
          const fileName = `Voice_Received_${this.nowDateStr()}.mp3`;
          const buf = await FileConverter.convert(fileBuffer!, fileFormat, 'mp3');
          const attachment = new MessageAttachment(buf!, fileName);
          files.push(attachment);
        }
        break;
      // @ts-ignore
      case 'gp2': // Chat/group rename
        this.channelName = undefined;
        await this.channel?.setName(body);
        this.channelName = this.channel?.name;
        embed.setDescription(`*Changed chat name to ${body}*`);
        embeds.push(embed);
        break;
      default:
        return;
    }
    
    try {
      const dcMessage = await this.channel!.send({ embeds, files, components });
      this.dcMsgIdAndWaMsgId![dcMessage.id] = id;
      this.emit('dc message sent', dcMessage);
    } catch (exc) {
      console.error('Error on sent message to discord', exc);
    }
  }

  private async sendNonReceivedMessages() {
    if (!this.channelId) return;
    let lastMessageTimestamp = await Whatsapp.getLastMessageTimestampByChatId(this.waChatId);
    if (lastMessageTimestamp == null) return;
    const oldLastMessageTimestamp = this.lastMessageTS;
    if (oldLastMessageTimestamp == null) return;
    if (lastMessageTimestamp > oldLastMessageTimestamp) {
      // Calc new messages to send
      const newMessages = await Whatsapp.getMessagesAfterTimestampByChatId(this.waChatId, oldLastMessageTimestamp);
      const toSendMessages = newMessages.length <= oldMessagesLimit ? newMessages : newMessages.slice(-oldMessagesLimit);
      // Send
      if (newMessages.length > oldMessagesLimit) {
        await this.channel?.send(`[BOT]: Too much messages, only the last ${oldMessagesLimit} are being shown.`);
      }
      for (let message of toSendMessages) {
        await this.receiveWhatsappChatMessage(message);
      }
    }
  }

  private nowDateStr() {
    let date = new Date();
    return `${date.getHours()}_${date.getMinutes()}__${date.getDate()}_${date.getMonth()}_${date.getFullYear()}`
  }
}
