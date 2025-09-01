import '../styles/tailwind.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { t } from '@/utils/i18n';
import { getUILocale, isRTLLanguage } from '@/utils/rtl';
import { AppSelect } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { debounce } from 'radash';
import {
  ArrowLeftRight,
  Languages,
  Type,
  Sparkles,
  Upload,
  Download,
  FileText,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { type LanguageCode, SUPPORTED_LANGUAGES, DEFAULT_TARGET_LANGUAGE } from '@/shared/languages';
import { MSG_TRANSLATE_TEXT, MSG_EASTER_CONFETTI } from '@/shared/messages';
import { STREAMING_LENGTH_THRESHOLD, normalizeToAsyncStringIterable, type TranslatorInstance } from '@/shared/streaming';
import { parseEpubFile, generateTranslatedEpub, type EpubBook, type TextSegment } from '@/utils/epubParser';


type LanguageOption = LanguageCode | 'auto';

// Limited-concurrency async mapper (top-level function to avoid hook deps)
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrencyLimit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let inFlight = 0;
  let nextIndex = 0;
  return await new Promise<R[]>((resolve, reject) => {
    const launch = () => {
      while (inFlight < concurrencyLimit && nextIndex < items.length) {
        const current = nextIndex++;
        inFlight++;
        void worker(items[current], current)
          .then((res) => {
            results[current] = res;
          })
          .catch(reject)
          .finally(() => {
            inFlight--;
            if (results.length === items.length && nextIndex >= items.length && inFlight === 0) {
              resolve(results);
            } else {
              launch();
            }
          });
      }
    };
    launch();
  });
}

// File translation state interface
interface FileTranslationState {
  file: File | null;
  isProcessing: boolean;
  progress: number;
  currentSegment: number;
  totalSegments: number;
  translatedContent: Blob | null;
  autoDownload: boolean;
  status: 'idle' | 'parsing' | 'translating' | 'completed' | 'error';
  error: string | null;
  book: EpubBook | null;
  segments: TextSegment[] | null;
}


// ============ Local built-in AI APIs (optional, best-effort) ============
// 使用共享的 TranslatorInstance 类型

interface TranslatorStaticLegacy {
  create: (opts: { sourceLanguage: LanguageCode; targetLanguage: LanguageCode; monitor?: (m: unknown) => void }) => Promise<TranslatorInstance> | TranslatorInstance;
}

interface TranslatorStaticModern {
  createTranslator: (opts: { sourceLanguage: LanguageCode; targetLanguage: LanguageCode; monitor?: (m: unknown) => void }) => Promise<TranslatorInstance> | TranslatorInstance;
}

type GlobalWithAPIs = (Window & typeof globalThis) & {
  Translator?: TranslatorStaticLegacy;
  translation?: TranslatorStaticModern;
  LanguageDetector?: LanguageDetectorStatic;
} & Record<string, unknown>;

interface LanguageDetectorInstance {
  detect: (text: string) => Promise<Array<{ detectedLanguage: LanguageCode; confidence: number }>>;
}

interface LanguageDetectorStatic {
  create: (opts?: { monitor?: (m: unknown) => void }) => Promise<LanguageDetectorInstance> | LanguageDetectorInstance;
}

async function resolveLocalTranslatorAdapter(): Promise<
  | { kind: 'legacy'; api: TranslatorStaticLegacy }
  | { kind: 'modern'; api: TranslatorStaticModern }
  | null
> {
  const w = window as unknown as GlobalWithAPIs;
  const legacy = w.Translator as TranslatorStaticLegacy | undefined;
  if (legacy && typeof legacy.create === 'function') {
    return { kind: 'legacy', api: legacy };
  }
  const modern = w.translation as TranslatorStaticModern | undefined;
  if (modern && typeof modern.createTranslator === 'function') {
    return { kind: 'modern', api: modern };
  }
  return null;
}

async function getOrCreateLocalTranslator(source: LanguageCode, target: LanguageCode): Promise<TranslatorInstance> {
  const key = `__nt_sp_translator_${source}_${target}`;
  const g = window as unknown as GlobalWithAPIs;
  if (g[key as keyof typeof g]) return g[key as keyof typeof g] as TranslatorInstance;
  const adapter = await resolveLocalTranslatorAdapter();
  if (!adapter) throw new Error('Translator API unavailable');
  let instance: TranslatorInstance;
  if (adapter.kind === 'legacy') {
    instance = await adapter.api.create({ sourceLanguage: source, targetLanguage: target });
  } else {
    instance = await (adapter.api as TranslatorStaticModern).createTranslator({ sourceLanguage: source, targetLanguage: target });
  }
  if (instance?.ready) {
    try { await instance.ready; } catch { }
  }
  (g as Record<string, unknown>)[key] = instance;
  return instance;
}

async function getOrCreateLocalDetector(): Promise<LanguageDetectorInstance> {
  const cacheKey = '__nt_sp_detector';
  const w = window as unknown as GlobalWithAPIs;
  if ((w as Record<string, unknown>)[cacheKey]) return (w as Record<string, unknown>)[cacheKey] as LanguageDetectorInstance;
  const detectorApi = (w.LanguageDetector as LanguageDetectorStatic | undefined);
  if (!detectorApi || typeof detectorApi.create !== 'function') throw new Error('Language Detector API unavailable');
  const det = await detectorApi.create();
  (w as Record<string, unknown>)[cacheKey] = det;
  return det;
}

async function detectLanguageLocal(text: string): Promise<LanguageCode | null> {
  try {
    const det = await getOrCreateLocalDetector();
    const res = await det.detect(text.slice(0, 2000));
    return res?.[0]?.detectedLanguage ?? null;
  } catch {
    return null;
  }
}

// 流式工具已移至共享模块

// ============ Confetti (no-deps, lightweight) ============
interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  gravity: number;
  drag: number;
  ageMs: number;
  ttlMs: number;
}

function playConfetti(durationMs = 3000, particleCount = 320): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve();
      return;
    }
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '999999';
    canvas.style.opacity = '1';
    document.body.appendChild(canvas);

    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const COLORS = ['#FFC700', '#FF85C0', '#60A5FA', '#34D399', '#F472B6', '#FBBF24'];

    const particles: ConfettiParticle[] = [];
    const emissionDuration = Math.max(800, Math.floor(durationMs * 0.55));
    const fadeOutDuration = Math.min(1200, Math.floor(durationMs * 0.4));
    const targetRatePerMs = particleCount / emissionDuration; // particles per ms
    let spawnRemainder = 0;

    const spawn = (count: number) => {
      for (let i = 0; i < count; i++) {
        // 三路喷口：左上、右上、随机顶端，提升横向覆盖
        const lane = Math.random();
        let x = 0;
        let vx = 0;
        if (lane < 0.33) {
          x = rand(canvas.width * 0.05, canvas.width * 0.2);
          vx = rand(1.2, 3.2) * dpr;
        } else if (lane < 0.66) {
          x = rand(canvas.width * 0.8, canvas.width * 0.95);
          vx = -rand(1.2, 3.2) * dpr;
        } else {
          x = rand(0, canvas.width);
          vx = rand(-2.0, 2.0) * dpr;
        }
        particles.push({
          x,
          y: rand(-24 * dpr, 6 * dpr),
          vx,
          vy: rand(2.4, 5.2) * dpr,
          size: rand(6, 12) * dpr,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          rotation: rand(0, Math.PI * 2),
          rotationSpeed: rand(-0.3, 0.3),
          gravity: rand(0.08, 0.14) * dpr,
          drag: rand(0.988, 0.996),
          ageMs: 0,
          ttlMs: rand(durationMs * 0.9, durationMs * 1.3),
        });
      }
    };

    // 初始少量即刻爆发，避免只在顶部一角
    spawn(Math.floor(particleCount * 0.25));

    const start = performance.now();
    let last = start;
    let raf = 0;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.remove();
    };

    const tick = (now: number) => {
      const elapsed = now - start;
      const dt = Math.min(32, now - last); // clamp dt to reduce frame spikes
      last = now;

      // 持续喷射，覆盖全屏
      if (elapsed < emissionDuration) {
        const quota = targetRatePerMs * dt + spawnRemainder;
        const toSpawn = Math.floor(quota);
        spawnRemainder = quota - toSpawn;
        if (toSpawn > 0) spawn(toSpawn);
      }

      // 结尾淡出
      const fadeStart = durationMs - fadeOutDuration;
      const alpha = elapsed >= fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / fadeOutDuration) : 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.globalAlpha = alpha;

      // 更新并绘制
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.ageMs += dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // 出界或寿命到期则移除
        if (p.y > canvas.height + 40 * dpr || p.x < -40 * dpr || p.x > canvas.width + 40 * dpr || p.ageMs > p.ttlMs) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        const w = p.size;
        const h = p.size * 0.6;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }

      ctx.restore();

      // 结束条件：时间到且没有粒子
      if (elapsed >= durationMs && particles.length === 0) {
        cleanup();
        resolve();
      } else {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
  });
}

const SidePanel: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = React.useState<'text' | 'file'>('text');

  // Text translation state
  const [sourceLanguage, setSourceLanguage] = React.useState<LanguageOption>('auto');
  const [targetLanguage, setTargetLanguage] = React.useState<LanguageCode>(DEFAULT_TARGET_LANGUAGE);
  const [inputText, setInputText] = React.useState<string>('');
  const [outputText, setOutputText] = React.useState<string>('');
  const [detectedSource, setDetectedSource] = React.useState<LanguageCode | null>(null);
  const [isTranslating, setIsTranslating] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // File translation state
  const [fileState, setFileState] = React.useState<FileTranslationState>({
    file: null,
    isProcessing: false,
    progress: 0,
    currentSegment: 0,
    totalSegments: 0,
    translatedContent: null,
    autoDownload: false,
    status: 'idle',
    error: null,
    book: null,
    segments: null,
  });

  // Performance settings: auto-tune based on hardware
  const [concurrency, setConcurrency] = React.useState<number>(() => {
    const cores = (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency;
    // Heuristic: use min(12, max(4, floor(cores * 0.75)))
    const guess = Math.floor(((cores && cores > 0) ? cores : 8) * 0.75);
    return Math.max(4, Math.min(12, guess));
  });

  const activeTabIdRef = React.useRef<number | null>(null);
  // 流式任务管理
  const streamReaderRef = React.useRef<ReadableStreamDefaultReader<unknown> | null>(null);
  const jobCounterRef = React.useRef<number>(0);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const ui = getUILocale();
    const dir = isRTLLanguage(ui) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', ui);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTabIdRef.current = tab?.id ?? null;
      } catch (_e) {
        activeTabIdRef.current = null;
      }
    })();
  }, []);

  // Load auto-download setting from storage
  React.useEffect(() => {
    (async () => {
      try {
        const result = await chrome.storage.local.get('fileTranslation:autoDownload');
        if (result['fileTranslation:autoDownload'] !== undefined) {
          setFileState(prev => ({
            ...prev,
            autoDownload: Boolean(result['fileTranslation:autoDownload'])
          }));
        }
      } catch (_e) {
        // ignore
      }
    })();
  }, []);

  // 进入站点或背景标记变化时，触发一次撒花彩蛋
  React.useEffect(() => {
    const KEY = MSG_EASTER_CONFETTI;

    const tryOnce = async () => {
      try {
        const res = await chrome.storage.local.get(KEY);
        if (res && (res as Record<string, unknown>)[KEY] === true) {
          await playConfetti();
          await chrome.storage.local.remove(KEY);
        }
      } catch {
        // noop
      }
    };

    void tryOnce();

    const onStorageChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName !== 'local') return;
      const change = changes[KEY];
      if (change && change.newValue === true) {
        void (async () => {
          await playConfetti();
          await chrome.storage.local.remove(KEY);
        })();
      }
    };

    chrome.storage.onChanged.addListener(onStorageChanged);

    const runtimeListener: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (message) => {
      if ((message as { type?: string } | undefined)?.type === MSG_EASTER_CONFETTI) {
        void playConfetti();
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(runtimeListener);

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
      chrome.runtime.onMessage.removeListener(runtimeListener);
    };
  }, []);

  // 卸载清理：取消可能存在的流式读取
  React.useEffect(() => {
    return () => {
      const reader = streamReaderRef.current;
      if (reader) {
        try { reader.cancel(); } catch { /* noop */ }
        streamReaderRef.current = null;
      }
    };
  }, []);

  const pingOnce = React.useCallback(async (tabId: number): Promise<boolean> => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: '__PING__' });
      return Boolean((res as { ok?: boolean } | undefined)?.ok);
    } catch (_e) {
      return false;
    }
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // File handling functions
  const handleFileSelect = React.useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.epub')) {
      setFileState(prev => ({
        ...prev,
        error: t('unsupported_file_format'),
        status: 'error'
      }));
      return;
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setFileState(prev => ({
        ...prev,
        error: t('file_too_large'),
        status: 'error'
      }));
      return;
    }

    setFileState(prev => ({
      ...prev,
      file,
      error: null,
      status: 'idle',
      translatedContent: null,
      progress: 0,
      currentSegment: 0,
      totalSegments: 0
    }));
  }, []);

  const handleFileDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const triggerFileSelect = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const saveAutoDownloadSetting = React.useCallback(async (value: boolean) => {
    try {
      await chrome.storage.local.set({ 'fileTranslation:autoDownload': value });
    } catch (_e) {
      // ignore
    }
  }, []);

  const downloadTranslatedFile = React.useCallback(() => {
    if (!fileState.translatedContent || !fileState.book) return;

    const url = URL.createObjectURL(fileState.translatedContent);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileState.book.metadata.title}_translated.epub`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [fileState.translatedContent, fileState.book]);

  // (mapper moved to top-level)

  const ensureContentScript = React.useCallback(async () => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    const ok = await pingOnce(tabId);
    if (ok) return;
    try {
      const tab = (await chrome.tabs.get(tabId)) as chrome.tabs.Tab;
      const url = tab.url ?? '';
      if (/^(chrome|edge|about|brave|opera|vivaldi):/i.test(url)) return;
      await chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] });
      await new Promise((r) => setTimeout(r, 50));
      await pingOnce(tabId);
    } catch (_err) { }
  }, [pingOnce]);

  const translateFile = React.useCallback(async () => {
    if (!fileState.file) {
      setFileState(prev => ({
        ...prev,
        error: t('select_file_first'),
        status: 'error'
      }));
      return;
    }

    setFileState(prev => ({
      ...prev,
      isProcessing: true,
      error: null,
      status: 'parsing',
      progress: 0,
      currentSegment: 0,
      totalSegments: 0
    }));

    try {
      // Parse EPUB file
      const { book, segments } = await parseEpubFile(fileState.file);

      setFileState(prev => ({
        ...prev,
        book,
        segments,
        totalSegments: segments.length,
        status: 'translating'
      }));

      // Speed-ups:
      // 1) Detect source language once using a sample
      const sampleText = segments
        .slice(0, Math.min(12, segments.length))
        .map(s => s.originalText)
        .join('\n\n')
        .slice(0, 3000);
      let detectedSource: LanguageCode = 'en';
      try {
        const d = await detectLanguageLocal(sampleText);
        if (d) detectedSource = d;
      } catch { }

      // 2) Reuse translator instance if possible
      let translator: TranslatorInstance | null = null;
      try {
        if (detectedSource !== targetLanguage) {
          translator = await getOrCreateLocalTranslator(detectedSource, targetLanguage);
        }
      } catch {
        translator = null;
      }

      // 3) Ensure content script once for possible fallback
      await ensureContentScript();

      // 4) Deduplicate cache for repeated paragraphs
      const memoryCache = new Map<string, string>();

      // 5) Limited concurrency translation
      const total = segments.length;
      let completed = 0;
      const updateProgress = () => {
        const pct = Math.round(((completed) / total) * 100);
        setFileState(prev => ({ ...prev, progress: pct, currentSegment: completed }));
      };

      const worker = async (segment: TextSegment): Promise<TextSegment> => {
        try {
          if (detectedSource === targetLanguage) {
            completed++;
            updateProgress();
            return { ...segment, translatedText: segment.originalText };
          }
          const cached = memoryCache.get(segment.originalText);
          if (cached) {
            completed++;
            updateProgress();
            return { ...segment, translatedText: cached };
          }

          // Prefer local translator
          if (translator) {
            const out = await translator.translate(segment.originalText);
            memoryCache.set(segment.originalText, out);
            completed++;
            updateProgress();
            return { ...segment, translatedText: out };
          }

          // Fallback via content script bridge
          const tabId = activeTabIdRef.current ?? null;
          if (!tabId) throw new Error('Active tab missing');
          const res = (await chrome.tabs.sendMessage(tabId, {
            type: MSG_TRANSLATE_TEXT,
            payload: { text: segment.originalText, sourceLanguage: detectedSource, targetLanguage },
          })) as { ok?: boolean; result?: string; detectedSource?: LanguageCode } | undefined;
          if (res?.ok && typeof res.result === 'string') {
            memoryCache.set(segment.originalText, res.result);
            completed++;
            updateProgress();
            return { ...segment, translatedText: res.result };
          }
          throw new Error('Translation failed');
        } catch {
          completed++;
          updateProgress();
          return { ...segment, translatedText: segment.originalText };
        }
      };

      const translatedSegments = await mapWithConcurrency(segments, Math.max(1, Math.min(12, concurrency)), worker);

      // Generate translated EPUB
      const translatedBlob = await generateTranslatedEpub(
        fileState.file,
        book,
        translatedSegments
      );

      setFileState(prev => ({
        ...prev,
        translatedContent: translatedBlob,
        status: 'completed',
        isProcessing: false,
        progress: 100
      }));

      // Auto-download if enabled
      if (fileState.autoDownload) {
        const url = URL.createObjectURL(translatedBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${book.metadata.title}_translated.epub`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

    } catch (error) {
      console.error('File translation error:', error);
      setFileState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : t('unknown_error'),
        status: 'error',
        isProcessing: false
      }));
    }
  }, [fileState.file, fileState.autoDownload, targetLanguage, ensureContentScript, concurrency]);

  const translate = React.useCallback(async () => {
    const tabId = activeTabIdRef.current;
    if (!tabId || !inputText.trim()) {
      setOutputText('');
      setDetectedSource(null);
      return;
    }
    setError(null);
    setIsTranslating(true);
    try {
      // 取消上一次进行中的流
      if (streamReaderRef.current) {
        try { await streamReaderRef.current.cancel(); } catch { /* noop */ }
        streamReaderRef.current = null;
      }
      // 新任务 id，避免竞态覆盖
      jobCounterRef.current = (jobCounterRef.current || 0) + 1;
      const jobId = jobCounterRef.current;

      // 1) 尝试本地直译（若内置 API 在侧边栏可用）
      let localSucceeded = false;
      try {
        const src: LanguageCode = sourceLanguage === 'auto'
          ? (await detectLanguageLocal(inputText)) || 'en'
          : (sourceLanguage as LanguageCode);
        if (src && targetLanguage && src !== targetLanguage) {
          const translator = await getOrCreateLocalTranslator(src, targetLanguage);

          // 按行翻译，严格保持换行结构
          setOutputText('');
          setDetectedSource(sourceLanguage === 'auto' ? src : null);
          const lines = inputText.split(/\r?\n/);
          const resultLines: string[] = [];
          for (const line of lines) {
            if (jobCounterRef.current !== jobId) {
              // 被新任务打断，直接退出，交由新任务处理
              return;
            }
            if (!line) {
              resultLines.push('');
              setOutputText(resultLines.join('\n'));
              continue;
            }
            const canStreamLine = typeof translator.translateStreaming === 'function' && line.length >= STREAMING_LENGTH_THRESHOLD;
            if (canStreamLine) {
              let receivedAny = false;
              let partial = '';
              try {
                const streamLike = (translator.translateStreaming as (text: string) => unknown)(line);
                for await (const chunk of normalizeToAsyncStringIterable(streamLike, (reader) => {
                  streamReaderRef.current = reader;
                })) {
                  if (jobCounterRef.current !== jobId) return;
                  receivedAny = true;
                  partial += chunk;
                  setOutputText(resultLines.concat(partial).join('\n'));
                }
              } catch (_e) {
                // 忽略流式错误，回退到非流式
              } finally {
                streamReaderRef.current = null;
              }
              if (jobCounterRef.current !== jobId) return;
              if (receivedAny) {
                resultLines.push(partial);
                setOutputText(resultLines.join('\n'));
              } else {
                const out = await translator.translate(line);
                if (jobCounterRef.current !== jobId) return;
                resultLines.push(out);
                setOutputText(resultLines.join('\n'));
              }
            } else {
              const out = await translator.translate(line);
              if (jobCounterRef.current !== jobId) return;
              resultLines.push(out);
              setOutputText(resultLines.join('\n'));
            }
          }
          if (jobCounterRef.current === jobId) {
            localSucceeded = true;
          }
        } else {
          // 同语种，无需翻译
          setOutputText(inputText);
          setDetectedSource(sourceLanguage === 'auto' ? src : null);
          localSucceeded = true;
        }
      } catch {
        localSucceeded = false;
      }

      if (!localSucceeded) {
        // 2) 回退到内容脚本（页面主世界桥或直接使用内容脚本的内置 API）
        const sendTranslate = async (): Promise<{ ok?: boolean; result?: string; detectedSource?: LanguageCode; error?: string } | undefined> => {
          const res = await chrome.tabs.sendMessage(tabId, {
            type: MSG_TRANSLATE_TEXT,
            payload: {
              text: inputText,
              sourceLanguage,
              targetLanguage,
            },
          });
          return res as { ok?: boolean; result?: string; detectedSource?: LanguageCode; error?: string } | undefined;
        };

        await ensureContentScript();
        let res: { ok?: boolean; result?: string; detectedSource?: LanguageCode; error?: string } | undefined;
        try {
          res = await sendTranslate();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
            await ensureContentScript();
            await new Promise((r) => setTimeout(r, 50));
            res = await sendTranslate();
          } else {
            throw err;
          }
        }
        if (res?.ok) {
          setOutputText(res.result ?? '');
          setDetectedSource(res.detectedSource ?? null);
        } else {
          throw new Error(res?.error || t('send_translate_command_failed'));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('unknown_error'));
    } finally {
      setIsTranslating(false);
    }
  }, [inputText, sourceLanguage, targetLanguage, ensureContentScript]);

  const debouncedTranslateRef = React.useRef<(((arg?: unknown) => void) & { cancel?: () => void }) | null>(null);
  React.useEffect(() => {
    const fn = debounce({ delay: 500 }, (_?: unknown) => { void translate(); }) as unknown as
      ((arg?: unknown) => void) & { cancel?: () => void };
    debouncedTranslateRef.current = fn;
    return () => {
      fn.cancel?.();
    };
  }, [translate]);

  React.useEffect(() => {
    // 引用以满足依赖检查
    const _consume = inputText;
    debouncedTranslateRef.current?.('input');
  }, [inputText]);

  React.useEffect(() => {
    // 语言切换时立即翻译，确保目标语言与检测一致
    void translate();
  }, [translate]);

  // 当文件选中且空闲时自动开始翻译
  React.useEffect(() => {
    if (fileState.file && fileState.status === 'idle' && !fileState.isProcessing) {
      void translateFile();
    }
  }, [fileState.file, fileState.status, fileState.isProcessing, translateFile]);

  return (
    <div className="p-4 h-screen box-border text-sm text-gray-900 dark:text-gray-100">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'text' | 'file')}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="text" className="flex items-center gap-2 cursor-pointer">
            <Type className="size-4" />
            {t('text_translation_tab')}
          </TabsTrigger>
          <TabsTrigger value="file" className="flex items-center gap-2 cursor-pointer">
            <FileText className="size-4" />
            {t('file_translation_tab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="h-full mt-0">
          <div className="grid h-full gap-4 grid-rows-[1fr_1fr] min-[520px]:grid-rows-1 min-[520px]:grid-cols-2">
            <div className="flex h-full min-h-0 flex-col gap-2">
              <Label className="inline-flex items-center gap-1">
                <Languages className="size-4" />
                {t('source_language')}
              </Label>
              <AppSelect
                value={sourceLanguage}
                onValueChange={(v) => setSourceLanguage((v as LanguageOption) || 'auto')}
                options={[{ value: 'auto', label: t('auto_detect') }, ...SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))]}
              />
              <Textarea
                className="flex-1 min-h-44 resize-none"
                placeholder={t('sidepanel_input_placeholder')}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>
            <div className="flex h-full min-h-0 flex-col gap-2">
              <Label className="inline-flex items-center gap-1">
                <ArrowLeftRight className="size-4" />
                {t('target_language')}
              </Label>
              <AppSelect
                value={targetLanguage}
                onValueChange={(v) => setTargetLanguage(v as LanguageCode)}
                options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              />
              <Textarea
                className="flex-1 min-h-44 resize-none"
                placeholder={t('sidepanel_output_placeholder')}
                value={outputText}
                readOnly
              />
              {detectedSource && sourceLanguage === 'auto' && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                  <Type className="size-3.5" />
                  {t('source_language')}: {detectedSource}
                </div>
              )}
              {isTranslating && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                  <Sparkles className="size-3.5" />
                  {t('preparing_translator')}
                </div>
              )}
              {error && (
                <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="file" className="h-full mt-0">
          <div className="flex h-full flex-col gap-4">
            {/* Target Language Selection */}
            <div className="flex items-center gap-4">
              <Label className="inline-flex items-center gap-1">
                <ArrowLeftRight className="size-4" />
                {t('target_language')}
              </Label>
              <AppSelect
                value={targetLanguage}
                onValueChange={(v) => setTargetLanguage(v as LanguageCode)}
                options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              />
            </div>

            {/* Performance Settings hidden from UI; auto-tuned by hardware */}

            {/* File Upload Area (also show after completion for next file) */}
            {(!fileState.file || fileState.status === 'completed') && (
              <Card
                className="border-2 border-dashed border-gray-300 dark:border-neutral-700 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onClick={triggerFileSelect}
              >
                <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                  <Upload className="size-12 text-gray-400 dark:text-gray-500 mb-4" />
                  <p className="text-lg font-medium mb-2">
                    {t('file_upload_area')}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('file_supported_formats')}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* File Info */}
            {fileState.file && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="size-8 text-blue-500" />
                    <div className="flex-1">
                      <p className="font-medium">{fileState.file.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {(fileState.file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    {fileState.status === 'completed' && (
                      <CheckCircle className="size-6 text-green-500" />
                    )}
                    {fileState.status === 'error' && (
                      <AlertCircle className="size-6 text-red-500" />
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Translation Progress */}
            {fileState.isProcessing && (
              <div className="space-y-3">
                <Progress
                  value={fileState.progress}
                  className="w-full h-2"
                />
                <div className="text-center space-y-2">
                  {fileState.status === 'parsing' && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                      {t('file_parsing')}
                    </p>
                  )}
                  {fileState.status === 'translating' && (
                    <>
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                        {t('file_translating_progress')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('translation_progress_detail', [
                          fileState.currentSegment.toString(),
                          fileState.totalSegments.toString()
                        ])}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Error Display */}
            {fileState.error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription className="mt-1">
                  {fileState.error}
                </AlertDescription>
              </Alert>
            )}

            {/* Translate Button */}
            {fileState.file && !fileState.isProcessing && fileState.status !== 'completed' && (
              <Button
                onClick={translateFile}
                className="w-full"
                size="lg"
              >
                <Languages className="size-4 mr-2" />
                {t('translate_full_page')}
              </Button>
            )}

            {/* Download Section */}
            {fileState.status === 'completed' && fileState.translatedContent && (
              <div className="space-y-4">
                <Alert variant="success" className="border-green-200 dark:border-green-800">
                  <CheckCircle className="size-4" />
                  <AlertDescription className="mt-1">
                    {t('translation_completed')}
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={downloadTranslatedFile}
                  className="w-full"
                  size="lg"
                >
                  <Download className="size-4 mr-2" />
                  {t('download_translated_file')}
                </Button>

                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-download" className="text-xs font-medium">
                    {t('auto_download')}
                  </Label>
                  <Switch
                    id="auto-download"
                    checked={fileState.autoDownload}
                    onCheckedChange={(checked) => {
                      setFileState(prev => ({ ...prev, autoDownload: checked }));
                      saveAutoDownloadSetting(checked);
                    }}
                  />
                </div>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              style={{ display: 'none' }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container as HTMLElement);
root.render(<SidePanel />);