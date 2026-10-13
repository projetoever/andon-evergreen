/**
 * Tom de reserva autocontido para chamados sem MP3 disponível neste terminal.
 * O áudio configurado por setor/máquina sempre tem prioridade.
 */
export function createFallbackAlertWav(): Blob {
  const sampleRate = 16_000;
  const durationSeconds = 0.64;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeAscii(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const frequency = time < durationSeconds / 2 ? 740 : 980;
    const attack = Math.min(1, time * 30);
    const decay = Math.min(1, (durationSeconds - time) * 20);
    const envelope = Math.max(0, Math.min(attack, decay));
    const signal = Math.sin(2 * Math.PI * frequency * time);
    view.setInt16(44 + index * 2, Math.round(signal * envelope * 10500), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
