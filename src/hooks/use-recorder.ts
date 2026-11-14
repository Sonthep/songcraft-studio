"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "ready" | "recording" | "error";

export interface RecorderOptions {
  /** Hard limit to keep files and analysis bounded. */
  maxSeconds?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  deviceId?: string;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function describeError(err: unknown): string {
  const e = err as DOMException;
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone permission was denied. Allow microphone access in the browser's site settings and try again.";
    case "NotFoundError":
      return "No microphone was found. Connect an input device and try again.";
    case "NotReadableError":
      return "The microphone is in use by another application or could not be opened.";
    case "OverconstrainedError":
      return "The selected microphone is not available.";
    default:
      return e?.message || "Could not access the microphone.";
  }
}

/**
 * Microphone capture with MediaRecorder plus a live input level (RMS, 0..1).
 * Streams and audio nodes are released on stop/unmount.
 */
export function useRecorder(opts: RecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const resolveRef = useRef<((b: Blob | null) => void) | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const monitorRef = useRef<GainNode | null>(null);

  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const release = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    monitorRef.current = null;
    setLevel(0);
  }, []);

  /** Route the microphone to the speakers/headphones at the given gain (0 = off). */
  const setMonitorGain = useCallback((gain: number) => {
    const m = monitorRef.current;
    if (m && ctxRef.current) m.gain.setTargetAtTime(Math.max(0, Math.min(1, gain)), ctxRef.current.currentTime, 0.02);
  }, []);

  useEffect(() => () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    release();
  }, [release]);

  /** Ask for permission and start level monitoring (no recording yet). */
  const open = useCallback(async () => {
    if (!supported) {
      setState("error");
      setError("This browser does not support microphone recording.");
      return false;
    }
    if (streamRef.current) return true;
    setState("requesting");
    setError(null);
    try {
      const o = optsRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: o.deviceId ? { exact: o.deviceId } : undefined,
          echoCancellation: o.echoCancellation ?? false,
          noiseSuppression: o.noiseSuppression ?? false,
          autoGainControl: o.autoGainControl ?? false,
        },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      // Optional direct monitoring (off by default; browser latency is noticeable).
      const monitor = ctx.createGain();
      monitor.gain.value = 0;
      src.connect(monitor).connect(ctx.destination);
      monitorRef.current = monitor;
      const buf = new Float32Array(analyser.fftSize);
      let peakHold = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        let pk = 0;
        for (let i = 0; i < buf.length; i++) {
          sum += buf[i] * buf[i];
          pk = Math.max(pk, Math.abs(buf[i]));
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        peakHold = Math.max(pk, peakHold * 0.97);
        setPeak(peakHold);
        if (recRef.current?.state === "recording") {
          const secs = (performance.now() - startRef.current) / 1000;
          // 0.1 s resolution: identical values bail out of re-rendering.
          setElapsed(Math.floor(secs * 10) / 10);
          if (o.maxSeconds && secs >= o.maxSeconds) recRef.current.stop();
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setState("ready");
      try {
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
      } catch {
        /* ignore */
      }
      return true;
    } catch (err) {
      setState("error");
      setError(describeError(err));
      release();
      return false;
    }
  }, [supported, release]);

  const start = useCallback(async () => {
    const ok = await open();
    if (!ok || !streamRef.current) return false;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }) : null;
      setState(streamRef.current ? "ready" : "idle");
      resolveRef.current?.(blob);
      resolveRef.current = null;
    };
    rec.start(250);
    recRef.current = rec;
    startRef.current = performance.now();
    setElapsed(0);
    setState("recording");
    return true;
  }, [open]);

  /** Stop recording; resolves with the recorded Blob (or null if nothing was captured). */
  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recRef.current;
        if (!rec || rec.state === "inactive") {
          resolve(null);
          return;
        }
        resolveRef.current = resolve;
        rec.stop();
      }),
    [],
  );

  const close = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    release();
    setState("idle");
  }, [release]);

  return { supported, state, error, level, peak, elapsed, devices, open, start, stop, close, setMonitorGain };
}
