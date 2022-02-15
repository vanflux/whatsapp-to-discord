import { Message as DcMessage, Channel, TextChannel, MessageAttachment, MessageEmbed, MessageReaction, User, PartialMessageReaction, PartialUser } from "discord.js";
import Discord from "../bots/discord";
import EventEmitter from "events";
import AudioManager from "../audio-manager";
import AudioManipulation from "../converters/audio-manipulation";

const channelName = '🔉audio-editor🎨';
const channelTopic = 'Audio Editor Channel';

export interface AudioEditorData {
  channelId?: string;
};

export default class AudioEditorChannel extends EventEmitter {
  private guildId: string;
  private channel: TextChannel|undefined;
  private audioEditorData: AudioEditorData;
  private ready = false;
  
  private get channelId() { return this.audioEditorData.channelId };
  
  private set channelId(value) { this.audioEditorData.channelId = value };

  constructor(guildId: string, audioEditorData: AudioEditorData) {
    super();
    this.guildId = guildId;
    this.audioEditorData = audioEditorData;
  }

  public async setup() {
    if (this.ready) return;

    if (this.channelId) await this.loadExistentChannel();
    if (!this.channelId) await this.createNewChannel();

    if (this.channelId) {
      await Discord.on('channelDelete', channel => this.handleDiscordChannelDelete(channel));
      await Discord.on('messageReactionAdd', (reaction, user) => {this.handleDiscordReactionAdd(reaction, user)});

      AudioManager.on('audio_added', audioBuffer => this.handleAudioAdded(audioBuffer))

      this.ready = true;
      this.emit('ready');
    } else {
      this.emit('setup error');
    }
  }

  public isReady() {
    return this.ready;
  }

  public getChannelId() {
    return this.channelId;
  }
  
  public getChannel() {
    return this.channel;
  }

  public getAudioEditorData() {
    return this.audioEditorData;
  }

  private async setChannel(channel: TextChannel) {
    const changed = this.channel != null;
    this.channel = channel;
    this.channelId = channel.id;
    if (changed) this.emit('channel changed', channel);
    this.emit('data changed', this.audioEditorData);
  }

  private async loadExistentChannel() {
    const existentChannel = await Discord.getChannel(this.guildId, this.channelId!);
    if (existentChannel?.type === 'GUILD_TEXT') {
      this.setChannel(existentChannel);
    } else {
      this.channelId = undefined;
      this.emit('data changed', this.audioEditorData);
    }
  }

  private async createNewChannel() {
    const channelCreated = await Discord.createChannel(this.guildId, channelName, { type: 'GUILD_TEXT', topic: channelTopic }) as TextChannel;
    if (channelCreated) {
      this.emit('data changed', this.audioEditorData);
      this.setChannel(channelCreated);
    }
  }

  private async handleDiscordChannelDelete(channel: Channel) {
    if (channel.id !== this.channelId) return;
    await this.createNewChannel();
  }

  private async handleDiscordReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    if (reaction.message.channelId !== this.channelId) return;
    if (user.bot) return;

    switch (reaction.emoji.name) {
      case '👹':
        const nextAudioBuffer = AudioManager.getNextAudioBuffer();
        if (!nextAudioBuffer) return this.channel?.send('Audio not found');
        const newAudioBuffer = await AudioManipulation.concat(nextAudioBuffer, 'assets/audios/zap.mp3');
        if (!newAudioBuffer) return this.channel?.send('Audio manipulation failed');
        AudioManager.editNextAudioBuffer(newAudioBuffer);
        this.sendNewAudioMessage(newAudioBuffer);
        break;
      default:
        return this.channel?.send('Audio manipulation not found');
    }
  }

  private async handleAudioAdded(audioBuffer: Buffer) {
    if (!this.ready) {
      this.once('ready', () => {
        this.sendNewAudioMessage(audioBuffer);
      });
    } else {
      this.sendNewAudioMessage(audioBuffer);
    }
  }

  private async sendNewAudioMessage(audioBuffer: Buffer) {
    if (!this.channel) return;
    
    const embed = new MessageEmbed();
    embed.setTitle('New Audio Recorded');
    embed.setDescription('Here is your master piece');
    const dcMessage1 = await this.channel.send({ embeds: [embed] });

    const fileName = `Audio_Received_${this.nowDateStr()}.mp3`;
    const attachment = new MessageAttachment(audioBuffer, fileName);
    const dcMessage2 = await this.channel.send({ files: [attachment] });
    await dcMessage2.react('👹');
  }

  private nowDateStr() {
    let date = new Date();
    return `${date.getHours()}_${date.getMinutes()}__${date.getDate()}_${date.getMonth()}_${date.getFullYear()}`
  }
}
