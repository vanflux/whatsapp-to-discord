# W2D (Whatsapp to Discord)

Use Whatsapp through Discord.

---

## Usage

- Firstly, ensure that your node version is **16.6.0** or newer with `node -v`.
- Install image magick and(for windows users) add to the environment path vars.
- Install ffmpeg and(for windows users) add to the environment path vars.
- Create an application and a bot on discord developer website.
- Create an server for you (**ONLY YOU!!!**).
- Add the bot to the server as administrator.
- Get the discord bot token.
- Create a `credentials.ts` file inside the `src` folder and write the following:
```typescript
export const Credentials = {
  discordBotToken: 'YOUR_DISCORD_BOT_TOKEN',
  discordBotClientId: 'YOUR_DISCORD_BOT_CLIENT_ID',
};
```
- Run `npm i` to install dependencies.
- Run the bot with `npm run dev`, scan the qr code and enjoy.

---

## Problems

- For some reasong when I enable the headless mode sometimes the integrity check doesnt work. Then, by default, its disabled, if you want to enable go to `whatsapp.ts` file on `src/bots` dir and change what you want. I think it is happening because multi device support is very recent.

---

## I'm responsible for any damage?

**NO**, use at **your** risk!
