import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import Discord from "./bots/discord";
import Whatsapp from "./bots/whatsapp";
import ChatsChannel, { ChatsData } from "./channels/chats-channel";
import QrChannel, { QrData } from "./channels/qr-channel";
import AudioChannel, { AudioData } from "./channels/audio-channel";
import Webp2Gif from "./converters/webp-2-gif";
import AudioEditorChannel, { AudioEditorData } from "./channels/audio-editor-channel";
import CmdsChannel, { CmdsData } from "./channels/cmds-channel";
import getCommandDocs from "./command-docs";

export interface W2DData {
  version?: string;
  guildId?: string;
  chatsData?: ChatsData;
  qrData?: QrData;
  audioData?: AudioData;
  audioEditorData?: AudioEditorData;
  cmdsData?: CmdsData;
}

let w2dData: W2DData|undefined;

async function start() {
  if(!await Webp2Gif.checkMagickExists()) return console.log('ImageMagick CLI is missing!');
  
  console.log('Loading data');
  load();

  console.log('Initializing bots');
  initializeDiscord();
  initializeWhatsapp();

  if (w2dData === undefined) w2dData = {};
  if (w2dData.guildId === undefined) {
    console.log('Creating the initial data for the first run');
    const guildId = await Discord.getFirstGuildId();
    if (guildId === undefined) {
      console.log('No servers found, please add the bot on 1 guild');
      return;
    }
    w2dData.guildId = guildId;
  }
  if (w2dData.chatsData === undefined) w2dData.chatsData = {};
  if (w2dData.qrData === undefined) w2dData.qrData = {};
  if (w2dData.audioData === undefined) w2dData.audioData = {};
  if (w2dData.audioEditorData === undefined) w2dData.audioEditorData = {};
  if (w2dData.cmdsData === undefined) w2dData.cmdsData = {};
  w2dData.version = '1.0.2';

  console.log('Setting commands');
  Discord.setCommands(w2dData.guildId, getCommandDocs());
  
  console.log('Creating qr channel');
  const qrChannel = new QrChannel(w2dData.guildId, w2dData.qrData);
  qrChannel.on('data changed', () => save());
  qrChannel.setup();
  
  console.log('Creating audio channel');
  const audioChannel = new AudioChannel(w2dData.guildId, w2dData.audioData);
  audioChannel.on('data changed', () => save());
  audioChannel.setup();
  
  console.log('Creating audio editor channel');
  const audioEditorChannel = new AudioEditorChannel(w2dData.guildId, w2dData.audioEditorData);
  audioEditorChannel.on('data changed', () => save());
  audioEditorChannel.setup();

  console.log('Creating chats channel');
  const chatsChannel = new ChatsChannel(w2dData.guildId, w2dData.chatsData);
  chatsChannel.on('data changed', () => save());
  chatsChannel.setup();
  
  console.log('Creating cmds channel');
  const cmdsChannel = new CmdsChannel(w2dData.guildId, chatsChannel, w2dData.cmdsData);
  cmdsChannel.on('data changed', () => save());
  cmdsChannel.setup();

  console.log('Finish!');
}

function load() {
  try {
    if (!existsSync('state')) mkdirSync('state', { recursive: true });
    const json = readFileSync('state/state.json', 'utf-8');
    const data = JSON.parse(json);
    w2dData = data;
  } catch (exc) {
    w2dData = undefined;
    console.log('No current state has been loaded');
  }
}

function save() {
  if (!existsSync('state')) mkdirSync('state', { recursive: true });
  writeFileSync('state/state.json', JSON.stringify(w2dData), 'utf-8');
}

async function initializeWhatsapp() {
  await Whatsapp.connect();
}

async function initializeDiscord() {
  await Discord.connect(process.env.DISCORD_BOT_TOKEN, process.env.DISCORD_BOT_CLIENT_ID);
}

start();
