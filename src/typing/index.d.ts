
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DISCORD_BOT_TOKEN: string;
      DISCORD_BOT_CLIENT_ID: string;
    }
  }
}

export {};
