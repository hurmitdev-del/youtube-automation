import { spawn } from 'node:child_process';

export async function validateVideo(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-show_streams',
      '-of', 'json',
      path,
    ]);

    let output = '';

    proc.stdout.on('data', (d) => {
      output += d.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(false);
        return;
      }

      try {
        const data = JSON.parse(output);

        const hasVideo = data.streams?.some((s: any) => s.codec_type === 'video');
        const duration = Number(data.format?.duration);

        resolve(hasVideo && duration > 0);
      } catch {
        resolve(false);
      }
    });
  });
}