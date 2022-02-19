import { Message as DcMessage, TextChannel, MessageAttachment, MessageEmbed, MessageReaction, User, PartialMessageReaction, PartialUser } from "discord.js";
import Discord from "../bots/discord";
import EventEmitter from "events";
import AudioManager from "../audio-manager";
import AudioManipulation from "../converters/audio-manipulation";
import PersistentChannel from "../persistent-channel";

const channelName = '🔉audio-editor🎨';
const channelTopic = 'Audio Editor Channel';

export interface AudioEditorData {
  channelId?: string;
};

export default class AudioEditorChannel extends EventEmitter {
  private guildId: string;
  private audioEditorData: AudioEditorData;
  private persistentChannel: PersistentChannel<TextChannel>;
  private ready = false;
  
  private get channel() { return this.persistentChannel.getChannel() };
  private get channelId() { return this.persistentChannel.getChannelId() };

  constructor(guildId: string, audioEditorData: AudioEditorData) {
    super();
    this.guildId = guildId;
    this.audioEditorData = audioEditorData;
    this.persistentChannel = new PersistentChannel(this.guildId, this.audioEditorData.channelId, () => ({ channelName, options: { type: 'GUILD_TEXT', topic: channelTopic } }));
    this.persistentChannel.on('channel changed', (newChannelId: string) => this.handleChannelChanged(newChannelId));
  }

  public async setup() {
    if (this.ready) return true;
    if (!await this.persistentChannel.setup()) return false;

    await Discord.on('messageReactionAdd', (reaction, user) => {this.handleDiscordReactionAdd(reaction, user)});

    AudioManager.on('audio_added', audioBuffer => this.handleAudioAdded(audioBuffer))

    this.ready = true;
    this.emit('ready');
    return true;
  }
  
  private handleChannelChanged(newChannelId: string) {
    this.audioEditorData.channelId = newChannelId;
    this.emit('data changed', this.audioEditorData);
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
