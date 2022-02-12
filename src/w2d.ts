import { readFileSync, writeFileSync } from "fs";
import { Credentials } from "./credentials";
import Discord from "./bots/discord";
import Webp2Gif from "./converters/webp-2-gif";
import Whatsapp from "./bots/whatsapp";
import ChatsChannel, { ChatsData } from "./channels/chats-channel";

export interface W2DData {
  version: string;
  guildId: string;
  chatsData: ChatsData;
}

export default class W2D {
  private static w2dData: W2DData|undefined;

  public static async start() {
    if(!await Webp2Gif.checkMagickExists()) return console.log('ImageMagick CLI is missing!');
    
    console.log('Initializing bots');
    await this.initializeDiscord();
    await this.initializeWhatsapp();
    
    console.log('Loading data');
    this.load();

    if (this.w2dData === undefined) {
      console.log('Creating the initial data for the first run');
      const guildId = await this.getFirstGuildId();
      if (guildId === undefined) {
        console.log('No servers found, please add the bot on 1 guild');
        return;
      }
      this.w2dData = {
        version: '1.0.0',
        guildId,
        chatsData: {},
      };
    }

    console.log('Creating chats channel');
    const chatsChannel = new ChatsChannel(this.w2dData.guildId, this.w2dData.chatsData);
    chatsChannel.on('data changed', () => this.save());
    await chatsChannel.setup();

    console.log('Finish!');
  }

  private static async getFirstGuildId() {
    const oauthGuilds = await Discord.client.guilds.fetch({ limit: 1 });
    if (oauthGuilds.size === 0) return;
    const oauthGuild = oauthGuilds.first()!; // Get first guild
    return oauthGuild.id;
  }
  
  private static load() {
    try {
      const json = readFileSync('state.json', 'utf-8');
      const data = JSON.parse(json);
      this.w2dData = data;
    } catch (exc) {
      this.w2dData = undefined;
      console.log('No current state has been loaded');
    }
  }

  private static save() {
    writeFileSync('state.json', JSON.stringify(this.w2dData), 'utf-8');
  }

  private static async initializeWhatsapp() {
    await Whatsapp.connect();
  }

  private static async initializeDiscord() {
    await Discord.connect(Credentials.discordBotToken);
  }
}
