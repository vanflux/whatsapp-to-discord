import { Client } from "discord.js";

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
}
