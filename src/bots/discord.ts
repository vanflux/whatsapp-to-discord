import { Client, GuildChannelCreateOptions } from "discord.js";

export default class Discord {
  private static client: Client;
  private static ready = false;
  private static waitingReadyResolves: Function[] = [];

  public static async connect(token: string) {
    this.client = new Client({
      intents: [
        "GUILDS",
        "GUILD_BANS",
        "GUILD_EMOJIS_AND_STICKERS",
        "GUILD_INTEGRATIONS",
        "GUILD_INVITES",
        "GUILD_MESSAGES",
        "GUILD_MESSAGE_REACTIONS",
        "GUILD_MESSAGE_TYPING",
        "GUILD_SCHEDULED_EVENTS",
        "GUILD_VOICE_STATES",
        "GUILD_WEBHOOKS",
      ],
    });

    this.client.on('ready', () => {
      console.log('[Discord] Client ready!');
        
      this.ready = true;
      this.waitingReadyResolves.forEach(func=>func());
      this.waitingReadyResolves = [];
    });

    this.client.on('rateLimit', ({timeout, limit, method, path, route, global}) => {
      console.log(`[Discord] Rate limit: ` + 
                  `Timeout=${timeout}, ` +
                  `Limit=${limit}, ` +
                  `Method=${method}, ` +
                  `Path=${path}, ` +
                  `Route=${route}, ` +
                  `Global=${global}`);
    });
    
    await this.client.login(token);
  }

  public static waitReady() {
    if (this.ready) return;
    return new Promise(resolve => this.waitingReadyResolves.push(resolve));
  }

  public static async on(...args: Parameters<typeof Client.prototype.on>) {
    await this.waitReady();
    this.client.on(...args);
  }

  public static async getFirstGuildId() {
    await this.waitReady();
    const oauthGuilds = await Discord.client.guilds.fetch({ limit: 1 });
    if (oauthGuilds.size === 0) return;
    const oauthGuild = oauthGuilds.first()!; // Get first guild
    return oauthGuild.id;
  }

  public static async getGuildById(guildId: string) {
    await this.waitReady();
    try {
      return await this.client.guilds.fetch(guildId);
    } catch (exc) { }
  }
  
  public static async getChannel(guildId: string, channelId: string) {
    await this.waitReady();
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild) return;
      return (await guild.channels.fetch(channelId))?.fetch();
    } catch (exc) { }
  }

  public static async createChannel(guildId: string, name: string, options: GuildChannelCreateOptions) {
    await this.waitReady();
    try {
      const guild = await this.getGuildById(guildId);
      if (!guild) return;
      return await guild.channels.create(name, options);
    } catch (exc) { }
  }
}
