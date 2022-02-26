import { Interaction, Message as DcMessage, MessageEmbed, TextChannel } from "discord.js";
import EventEmitter from "events";
import Discord from "../bots/discord";
import Whatsapp from "../bots/whatsapp";
import { nameFromChat } from "../functions";
import PersistentChannel from "../persistent-channel";
import ChatsChannel from "./chats-channel";

const channelName = '🟢cmds🟢';
const channelTopic = 'General W2D Commands Channel';
const pageSize = 25;

export interface CmdsData {
  channelId?: string;
};

export default class CmdsChannel extends EventEmitter {
  private guildId: string;
  private chatsChannel: ChatsChannel;
  private cmdsData: CmdsData;
  private persistentChannel: PersistentChannel<TextChannel>;
  private ready = false;
  
  private get channelId() { return this.persistentChannel.getChannelId() };

  constructor(guildId: string, chatsChannel: ChatsChannel, cmdsData: CmdsData) {
    super();
    this.guildId = guildId;
    this.chatsChannel = chatsChannel;
    this.cmdsData = cmdsData;
    this.persistentChannel = new PersistentChannel(this.guildId, this.cmdsData.channelId, () => ({ channelName, options: { type: 'GUILD_TEXT', topic: channelTopic } }));
    this.persistentChannel.on('channel created', (newChannelId: string) => this.handleChannelCreated(newChannelId));
  }

  public async setup() {
    if (this.ready) return true;
    if (!await this.persistentChannel.setup()) return false;

    await Discord.on('interactionCreate', interaction => this.handleDiscordInteractionCreate(interaction));

    this.ready = true;
    this.emit('ready');
    return true;
  }
  
  private handleChannelCreated(newChannelId: string) {
    this.cmdsData.channelId = newChannelId;
    this.emit('data changed', this.cmdsData);
  }

  private async handleDiscordInteractionCreate(interaction: Interaction) {
    if (!interaction.isCommand()) return;
    if (interaction.channelId !== this.channelId) return;
    await interaction.deferReply();
    const subCommand = interaction.options.getSubcommand();
    switch (interaction.commandName) {
      case 'chat':
        switch (subCommand) {
          case 'list': {
            const pageNumber = interaction.options.getInteger('page') || 0;
            const page = await this.chatPageOrderedByName(pageNumber, pageSize);
            const idOffset = pageSize * pageNumber;
            const listString = page.chats.map((chat, i) => `${idOffset + i}. ${this.chatsChannel.chatAlreadyAdded(chat.id) ? '(✅)' : ''} ${nameFromChat(chat)}`).join('\n');
            const paginationString = `Page ${page.pageNumber} of ${page.pageCount} (${page.pageSize} items/page)`;
            const description = `${listString}\n${paginationString}`;
            const embed = new MessageEmbed()
            .setTitle('Chat List')
            .setDescription(description);
            await interaction.editReply({ embeds: [embed] });
            break;
        }
          case 'load': {
            const embed = new MessageEmbed().setTitle('Chat Load');
            const inputId = interaction.options.getInteger('chat_id');
            if (inputId != undefined) {
              const pageNumber = Math.floor(inputId / pageSize);
              const page = await this.chatPageOrderedByName(pageNumber, pageSize);
              const index = (inputId) - pageNumber * pageSize;
              const waChatId = page.chats[index]?.id;
              if (waChatId) {
                if (await this.chatsChannel.chatExists(waChatId)) {
                  if (!this.chatsChannel.chatAlreadyAdded(waChatId)) {
                    await this.chatsChannel.addNewChat(waChatId);
                    embed.setDescription('✅ Chat loaded successfully! ✅');
                  } else {
                    embed.setDescription('❌ Chat already added! ❌');
                  }
                } else {
                  embed.setDescription('❌ Chat doesnt exists! ❌');
                }
              } else {
                embed.setDescription('❌ Chat id out of bounds! ❌');
              }
            } else {
              embed.setDescription('❌ Invalid chat id! ❌');
            }
            await interaction.editReply({ embeds: [embed] });
            break;
          }
        }
        break;
    }
  }

  private async chatPageOrderedByName(pageNumber: number, pageSize: number) {
    const allChats = await Whatsapp.getAllChats();
    const pageCount = Math.floor(allChats.length / pageSize);
    const chats = allChats.slice(pageNumber * pageSize, (pageNumber + 1) * pageSize);
    chats.sort((a, b) => nameFromChat(a).localeCompare(nameFromChat(b)));
    return { chats, pageNumber, pageSize, pageCount };
  }
}
