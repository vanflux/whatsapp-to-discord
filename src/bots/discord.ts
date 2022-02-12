import { Client, GuildChannelCreateOptions } from "discord.js";

export default class Discord {
  public static client: Client;

  public static async connect(token: string) {
    this.client = new Client({
      intents: [ "GUILDS", "GUILD_MESSAGES", "GUILD_MESSAGE_TYPING", "GUILD_MESSAGE_REACTIONS" ],
    });

    this.client.on('ready', () => {
      console.log('Discord client ready!');
    });
    
    await this.client.login(token);
  }

  public static async getGuildById(guildId: string) {
    try {
      return await this.client.guilds.fetch(guildId);
    } catch (exc) { }
  }
  
  public static async getChannel(guildId: string, channelId: string) {
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild) return;
      return (await guild.channels.fetch(channelId))?.fetch();
    } catch (exc) { }
  }

  public static async createChannel(guildId: string, name: string, options: GuildChannelCreateOptions) {
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild) return;
      return await guild.channels.create(name, options);
    } catch (exc) { }
  }
}
