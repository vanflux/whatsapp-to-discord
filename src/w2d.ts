import { decryptMedia, Message as WAMessage, MessageTypes } from "@open-wa/wa-automate";
import { ButtonInteraction, CategoryChannel, Guild, Message as DCMessage, MessageActionRow, MessageAttachment, MessageButton, MessageComponent, MessageEmbed, TextChannel } from "discord.js";
import { readFileSync, writeFileSync } from "fs";
import { Credentials } from "./credentials";
import Discord from "./discord";
import Whatsapp from "./whatsapp";
import { extension } from "mime-types";
import Ffmpeg from "fluent-ffmpeg";
import { ReadableStreamBuffer, WritableStreamBuffer } from "stream-buffers";
import Webp2Gif from "./webp2gif";

interface W2DState {
  guildId?: string;
  chatsChannelId?: string;
  chats: {[id: string]: W2DChatState};
}

interface W2DChatState {
  lastMessageTS: number;
  channelId: string;
  lastName: string;
  dcMsgIdAndwaMsgId: {[id: string]: string};
}

export default class W2D {
  private static state: W2DState;
  private static guild: Guild;
  private static chatsChannel: CategoryChannel;
  private static chatChannelsByChatId: {[chatId: string]: TextChannel} = {};
  
  public static async start() {
    if(!await Webp2Gif.checkMagickExists()) return console.log('ImageMagick CLI is missing!');
    
    console.log('Initializing');
    this.loadCurrentState();
    await this.initializeDiscord();
    await this.initializeWhatsapp();
    await this.loadDiscordInfos();

    console.log('Creating new chats');
    await this.createNewChats(10);
    console.log('Send new messages');
    await this.sendNewMessages();
    console.log('Start listening whatsapp chats');
    this.startListeningWhatsappChats();
    console.log('Start listening discord chats');
    this.startListeningDiscordChats();
  }

  public static startListeningWhatsappChats() {
    Whatsapp.client.onAnyMessage(message => {
      this.receiveWhatsappMessage(message);
    });
  }

  public static startListeningDiscordChats() {
    Discord.client.on('messageCreate', message => {
      if (message.author.bot) return;
      if (this.state.guildId !== message.guildId) return;
      this.sendWhatsappMessage(message);
    });
    
    Discord.client.on('interactionCreate', async interaction => {
      if (this.state.guildId === interaction.guildId && interaction.isButton) {
        const buttonInteraction = interaction as ButtonInteraction;
        const type = buttonInteraction.customId;
        const chatId = Object.entries(this.chatChannelsByChatId).find(([_, channel]) => channel.id === interaction.channelId)?.[0];
        if (chatId) {
          const messageId = this.state.chats[chatId].dcMsgIdAndwaMsgId[buttonInteraction.message.id];
          await buttonInteraction.deferUpdate();
          const waMessage = await Whatsapp.getMessageById(messageId);
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
        }
      }
    });
  }

  public static async sendNewMessages() {
    const tooMuchLimit = 15;
    for (let chatId in this.chatChannelsByChatId) {
      const chatState = this.state.chats[chatId];
      if (chatState == null) return;
      let lastMessageTimestamp = await Whatsapp.getLastMessageTimestampByChatId(chatId);
      if (lastMessageTimestamp == null) return;
      const oldLastMessageTimestamp = chatState.lastMessageTS;
      if (oldLastMessageTimestamp == null) return;
      if (lastMessageTimestamp > oldLastMessageTimestamp) {
        // Calc new messages to send
        const newMessages = await Whatsapp.getMessagesAfterTimestampByChatId(chatId, oldLastMessageTimestamp);
        const toSendMessages = newMessages.length <= tooMuchLimit ? newMessages : newMessages.slice(-tooMuchLimit);

        console.log(chatId, newMessages.length);
        
        // Send
        const channel = this.chatChannelsByChatId[chatId];
        if (newMessages.length > tooMuchLimit) channel.send(`[BOT]: Too much messages, only the last ${tooMuchLimit} are being shown.`);
        toSendMessages.forEach(message => this.receiveWhatsappMessage(message));
      }
    }
  }

  public static async sendWhatsappMessage(message: DCMessage) {
    const chatId = Object.entries(this.chatChannelsByChatId).find(([_, channel]) => channel.id === message.channelId)?.[0];
    if (!chatId) return console.log('Invalid whatsapp chatId to send message, chatId:', chatId, 'message:', message);
    console.log(`[Discord -> Whatsapp] ${chatId}: ${message.content}`);
    this.state.chats[chatId].lastMessageTS = Date.now();
    this.saveCurrentState();
    await Whatsapp.sendTextMessage(chatId, message.content);
    message.delete();
  }

  public static async receiveWhatsappMessage(message: WAMessage) {
    const { chatId, sender, text, t, type, mimetype } = message;
    console.log(`[Whatsapp -> Discord] ${chatId}: ${text}`);
    const channel = this.chatChannelsByChatId[chatId] || await this.createDiscordChatChannel(chatId);
    const senderName = sender.formattedName;
    this.state.chats[chatId].lastMessageTS = t * 1000;
    this.saveCurrentState();

    //console.log('message', message);

    const profilePictureUrl = message.sender?.profilePicThumbObj?.img;
    const fileFormat = mimetype && mimetype.includes('/') ? mimetype.split('/')[1].split(';')[0] : undefined;
    const fileExtension = mimetype ? extension(mimetype) : undefined;
    const hasFile = mimetype && fileFormat;
    const fileBuffer = hasFile ? await decryptMedia(message) : undefined;
    const originalFileName = hasFile ? `${t}.${extension(mimetype)}` : undefined;

    const embeds: MessageEmbed[] = [];
    const files: MessageAttachment[] = [];
    const components: MessageActionRow[] = [];

    const embed = new MessageEmbed();
    embed.setAuthor({ iconURL: profilePictureUrl, name: senderName });
    embed.setColor(message.fromMe ? 'GREEN' : 'GREY');
    switch (type) {
      case MessageTypes.TEXT:
        embed.setDescription(text);
        embeds.push(embed);
        break;
      case MessageTypes.AUDIO:
        if (hasFile) {
          const fileName = `Audio_Received_${this.nowDateStr()}.mp3`;
          const buf = await this.convert(fileBuffer!, fileFormat, 'mp3');
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
          if (message.isAnimated) {
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
          if (message.isGif) {
            const fileName = `Gif_Received_${this.nowDateStr()}.gif`;
            const buf = await this.convert(fileBuffer!, fileFormat, 'gif');
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
          const buf = await this.convert(fileBuffer!, fileFormat, 'mp3');
          const attachment = new MessageAttachment(buf!, fileName);
          files.push(attachment);
        }
        break;
    }
    
    try {
      const dcMessage = await channel.send({ embeds, files, components });
      this.state.chats[chatId].dcMsgIdAndwaMsgId[dcMessage.id] = message.id;
      this.saveCurrentState();
    } catch (exc) {
      console.error('Error on sent message to discord', exc);
    }
  }

  private static nowDateStr() {
    let date = new Date();
    return `${date.getHours()}_${date.getMinutes()}__${date.getDate()}_${date.getMonth()}_${date.getFullYear()}`
  }

  private static async convert(inputBuffer: Buffer, inputFormat: string, outputFormat: string) {
    console.log('convert', inputBuffer.length, inputFormat, outputFormat);

    return await new Promise<Buffer|undefined>(resolve => {
      const readable = new ReadableStreamBuffer();
      readable.put(inputBuffer);
      readable.stop();

      const writable = new WritableStreamBuffer();
      writable.on('finish', () => {
        const buf = writable.getContents();
        if (buf) {
          resolve(buf);
        } else {
          resolve(undefined);
        }
      });
      
      Ffmpeg()
      .input(readable).inputFormat(inputFormat)
      .output(writable).outputFormat(outputFormat)
      .run();
    });
  }

  public static async createNewChats(maxChatsCount: number) {
    const newChats = await this.getNewChats();
    const existentChatCount = Object.keys(this.state.chats).length;
    const newChatsCount = Math.max(0, maxChatsCount - existentChatCount);
    const newChatsToCreate = newChats.slice(0, newChatsCount);
    for (let chat of newChatsToCreate) {
      await this.createDiscordChatChannel(chat.id);
      const lastMessages = await Whatsapp.getLastMessagesByChatId(chat.id, 10);
      for (let message of lastMessages) {
        await this.receiveWhatsappMessage(message);
      }
    }
  }
  
  public static async getNewChats() {
    const chats = await Whatsapp.getAllChats();
    const newChats = chats.filter(chat => !this.state.chats[chat.id]);
    return newChats;
  }

  public static async createDiscordChatChannel(chatId: string) {
    const chat = await Whatsapp.getChatById(chatId);
    const name = chat.name || chat.contact.formattedName;

    const channel = await this.chatsChannel.createChannel(name, { type: 'GUILD_TEXT' });
    const chatState: W2DChatState = {
      channelId: channel.id,
      lastMessageTS: Date.now(),
      lastName: name,
      dcMsgIdAndwaMsgId: {},
    };
    this.state.chats[chatId] = chatState;
    this.chatChannelsByChatId[chatId] = channel;
    this.saveCurrentState();
    return channel;
  }

  public static async loadDiscordInfos() {
    if (this.state.guildId == null) {
      const oauthGuilds = await Discord.client.guilds.fetch({ limit: 1 });
      if (oauthGuilds.size === 0) return console.log('The bot has no guilds');
      const oauthGuild = oauthGuilds.first()!; // Get first guild
      this.state.guildId = oauthGuild.id;
      this.saveCurrentState();
    }
    this.guild = await Discord.client.guilds.fetch(this.state.guildId);

    if (this.state.chatsChannelId == null) {
      this.chatsChannel = await this.guild.channels.create('Chats', { type: 'GUILD_CATEGORY', position: 0 });
      this.state.chatsChannelId = this.chatsChannel.id;
      this.saveCurrentState();
    } else {
      this.chatsChannel = await (await this.guild.channels.fetch(this.state.chatsChannelId))?.fetch() as CategoryChannel;
    }

    for (let chatId in this.state.chats) {
      const chat = this.state.chats[chatId];
      const channel = await (await Discord.client.channels.fetch(chat.channelId))?.fetch() as TextChannel;
      this.chatChannelsByChatId[chatId] = channel;
    }
  }

  public static loadCurrentState() {
    try {
      const json = readFileSync('state.json', 'utf-8');
      const data = JSON.parse(json);
      this.state = data;
    } catch (exc) {
      console.log('No current state has been loaded');
      this.state = {
        chats: {},
      };
    }
  }

  public static saveCurrentState() {
    writeFileSync('state.json', JSON.stringify(this.state), 'utf-8');
  }

  public static async initializeWhatsapp() {
    await Whatsapp.connect();
  }

  public static async initializeDiscord() {
    await Discord.connect(Credentials.discordBotToken);
  }
}
