import { useCallback, useEffect, useRef, useState } from 'react'

/*
 * 語音輸入。用瀏覽器內建的 Web Speech API，不需要任何後端或金鑰。
 *
 * 支援度要注意：
 *   Safari / Chrome（含 iOS Safari）  可用
 *   Firefox                           不支援
 *   Capacitor 的 WKWebView            不支援 —— 真機版要改用原生外掛
 *                                     （@capacitor-community/speech-recognition）
 * 所以 supported 為 false 時呼叫端要把麥克風鈕收起來，不要給一顆按了沒反應的鈕。
 *
 * 另外這個 API 只在安全來源（https 或 localhost）下可用。
 */

/* TypeScript 的 DOM 型別沒有涵蓋這個 API，用到什麼就宣告什麼 */
type SpeechRecognitionResultLike = { transcript: string }
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [i: number]: { isFinal: boolean; length: number; [j: number]: SpeechRecognitionResultLike }
  }
}
type SpeechRecognitionErrorEventLike = { error: string }

type RecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function messageFor(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '麥克風權限被拒絕，請到瀏覽器設定開啟'
    case 'no-speech':
      return '沒有聽到聲音，再試一次'
    case 'audio-capture':
      return '找不到麥克風'
    case 'network':
      return '語音辨識服務連線失敗'
    case 'aborted':
      return ''
    default:
      return '語音辨識發生問題'
  }
}

export function useSpeechInput({
  lang = 'zh-TW',
  onTranscript,
}: {
  lang?: string
  /* 邊說邊回報：isFinal 為 false 時是暫時結果，之後可能會被改寫 */
  onTranscript: (text: string, isFinal: boolean) => void
}) {
  const [supported] = useState(() => recognitionCtor() !== null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<RecognitionLike | null>(null)

  /* onTranscript 每次 render 都是新的函式，用 ref 接住才不用重建 recognition */
  const handler = useRef(onTranscript)
  useEffect(() => {
    handler.current = onTranscript
  })

  useEffect(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return

    const r = new Ctor()
    r.lang = lang
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 1

    r.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) final += text
        else interim += text
      }
      if (final) handler.current(final, true)
      else if (interim) handler.current(interim, false)
    }

    r.onerror = (e) => {
      const message = messageFor(e.error)
      if (message) setError(message)
      setListening(false)
    }

    r.onend = () => setListening(false)

    recognition.current = r
    return () => {
      r.onresult = null
      r.onerror = null
      r.onend = null
      r.abort()
      recognition.current = null
    }
  }, [lang])

  const start = useCallback(() => {
    const r = recognition.current
    if (!r) return
    setError(null)
    try {
      r.start()
      setListening(true)
    } catch {
      /* 已經在聽的時候再呼叫 start 會丟例外，忽略即可 */
    }
  }, [])

  const stop = useCallback(() => {
    recognition.current?.stop()
    setListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { supported, listening, error, start, stop, toggle, clearError: () => setError(null) }
}
