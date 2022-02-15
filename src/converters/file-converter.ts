import { spawn } from "child_process";

export default class FileConverter {
  public static async convert(inputBuffer: Buffer, inputFormat: string|undefined, outputFormat: string|undefined, inputOptions: string[]=[], outputOptions: string[]=[]) {
    return new Promise<Buffer|undefined>(resolve => {
      const id = Math.floor(Math.random() * 1000000000);
      console.log(`[File Converter] Convert, id: ${id}, in length: ${inputBuffer.length} in format: ${inputFormat} out format: ${outputFormat}`);
      const start = Date.now();
      
      if (inputFormat === 'mpeg') inputFormat = undefined;
      const args = [
        ...inputOptions, ...(inputFormat ? ['-f', inputFormat] : []), '-i', 'pipe:',
        ...outputOptions, ...(outputFormat ? ['-f', outputFormat] : []), 'pipe:1',
      ];
      const buffers: Buffer[] = [];
      const proc = spawn('ffmpeg', args);
      proc.on('close', () => {
        const end = Date.now();
        console.log(`[File Converter] Conversion ended, id: ${id}, time(ms): ${end-start}`);
        
        resolve(Buffer.concat(buffers));
      });
      proc.stdout.on('data', buffer => buffers.push(buffer));
      proc.stderr.on('data', ()=>{});
      proc.stdin.write(inputBuffer);
      proc.stdin.end();
    });

    // For some unknown reason, fluent-ffmpeg is SOOO slow
    /*return await new Promise<Buffer|undefined>(resolve => {
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
      .input(readable).inputOptions(inputOptions).inputFormat(inputFormat)
      .output(writable).outputOptions(outputOptions).outputFormat(outputFormat)
      .run();
    });*/
  }
}
