import EventEmitter from "events";

export default class AudioManager {
  private static audioBuffers: Buffer[] =[];
  private static eventEmitter = new EventEmitter();

  public static addAudio(audioBuffer: Buffer) {
    this.audioBuffers.push(audioBuffer);
    this.eventEmitter.emit('audio_added', audioBuffer);
  }

  public static count() {
    return this.audioBuffers.length;
  }

  public static shiftNextAudioBuffer() {
    return this.audioBuffers.shift();
  }
  
  public static getNextAudioBuffer() {
    return this.audioBuffers.shift();
  }
  
  public static editNextAudioBuffer(newAudioBuffer: Buffer) {
    this.audioBuffers[0] = newAudioBuffer;
  }

  public static getDataUrl(audioBuffer: Buffer) {
    return `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
  }

  public static on(event: 'audio_added', listener: (audioBuffer: Buffer) => void): void;
  public static on(event: any, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }
}
