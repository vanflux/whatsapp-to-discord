
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_TOKEN: string;
      DISCORD_GUILD_ID: string;
    }
  }
}

export {};
