import Ffmpeg from "fluent-ffmpeg";
import { ReadableStreamBuffer, WritableStreamBuffer } from "stream-buffers";

export default class FileConverter {
  public static async convert(inputBuffer: Buffer, inputFormat: string, outputFormat: string) {
    console.log('convert', inputBuffer.length, inputFormat, outputFormat);

    return await new Promise<Buffer|undefined>(resolve => {
      const readable = new ReadableStreamBuffer();
      readable.put(inputBuffer);
      readable.stop();

      const writable = new WritableStreamBuffer();
      writable.on('finish', () => {
        const buf = writable.getContents();
        if (buf) {
          resolve(buf);
        } else {
          resolve(undefined);
        }
      });
      
      Ffmpeg()
      .input(readable).inputFormat(inputFormat)
      .output(writable).outputFormat(outputFormat)
      .run();
    });
  }
}
