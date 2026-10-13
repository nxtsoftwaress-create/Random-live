import { useEffect, useState } from "react";

/**
 * Returns `bars` normalized levels (0..1) from the stream's audio track,
 * sampled at ~15fps. All zeros when the stream is null or muted.
 */
export function useAudioLevel(stream: MediaStream | null, bars = 4): number[] {
  const [levels, setLevels] = useState<number[]>(() => Array<number>(bars).fill(0));

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevels(Array<number>(bars).fill(0));
      return;
    }

    let ctx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    try {
      ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
    } catch {
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let last = 0;

    const tick = (t: number): void => {
      raf = requestAnimationFrame(tick);
      if (t - last < 66) return;
      last = t;

      const live = stream.getAudioTracks().some((tr) => !tr.muted && tr.readyState === "live");
      if (!live) {
        setLevels(Array<number>(bars).fill(0));
        return;
      }

      analyser.getByteFrequencyData(data);
      const chunk = Math.max(1, Math.floor(data.length / bars));
      const next: number[] = [];
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < chunk; j++) sum += data[i * chunk + j] ?? 0;
        next.push(Math.min(1, sum / chunk / 140));
      }
      setLevels(next);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
        analyser.disconnect();
        void ctx.close();
      } catch {
        /* already closed */
      }
    };
  }, [stream, bars]);

  return levels;
}
