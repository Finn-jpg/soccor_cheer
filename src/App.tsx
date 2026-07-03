import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import {
  Activity,
  Camera,
  CameraOff,
  Crosshair,
  Gauge,
  Radio,
  ScanLine,
  ShieldAlert,
} from 'lucide-react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { trackVisit } from './analytics'
import './App.css'

type Vec = {
  x: number
  y: number
}

type EffectType =
  | 'card'
  | 'egg'
  | 'var'
  | 'goal'
  | 'gesture'
  | 'glove'
  | 'kick'
  | 'charm'
  | 'speaker'

type ToolItem = {
  id: string
  label: string
  icon: string
  effectType: EffectType
  defaultMessage: string
}

type GestureMode = 'idle' | 'hoverTool' | 'grabbed' | 'dragging' | 'released'

type GestureState = {
  mode: GestureMode
  cursor: Vec
  pinchStrength: number
  velocity: Vec
  activeToolId: string | null
}

type OverlayEffect = {
  id: string
  toolId: string
  effectType: EffectType
  position: Vec
  velocity: Vec
  createdAt: number
  message: string
  isCenterStage?: boolean
  icon?: string
}

type MatchInfo = {
  homeTeam: string
  awayTeam: string
  homeScore: string
  awayScore: string
  clock: string
}

type HandSnapshot = {
  id: string
  handedness: 'Left' | 'Right' | 'Unknown'
  point: Vec
  previewPoint: Vec
  thumb: Vec
  wrist: Vec
  landmarks: Vec[]
  previewLandmarks: Vec[]
  pinchStrength: number
  isPinching: boolean
  indexExtended: boolean
  thumbExtended: boolean
  pinkyExtended: boolean
  extendedFingers: number
  isFist: boolean
  isOpenPalm: boolean
  isSix: boolean
  isThumbsUp: boolean
  velocity: Vec
}

type QuickGesture = 'yellow-card' | 'red-card' | 'var' | 'egg' | 'goal'

type GestureCandidate = {
  toolId: QuickGesture
  velocity: Vec
}

type EggGestureState = {
  fistFrames: number
  openFrames: number
  armed: boolean
  lastFiredAt: number
}

type GoalGestureState = {
  toolId: QuickGesture | null
  frames: number
  lastFiredAt: number
}

type GrabCandidateState = {
  handId: string | null
  toolId: string | null
  frames: number
}

const handConnections = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
] as const

const cp = (...codes: number[]) => String.fromCodePoint(...codes)

const text = {
  redCard: '\u7ea2\u724c',
  yellowCard: '\u9ec4\u724c',
  egg: '\u9e21\u86cb',
  shrug: '\u644a\u624b',
  glove: '\u95e8\u5c06\u624b\u5957',
  kick: '\u98de\u8e22',
  charm: '\u7384\u5b66\u7b26',
  speaker: '\u5587\u53ed',
  directRed: '\u5efa\u8bae\u76f4\u63a5\u7f5a\u4e0b',
  warning: '\u8b66\u544a\u4e00\u6b21\uff0c\u522b\u6f14\u4e86',
  eggHit: '\u86cb\u58f3\u5df2\u547d\u4e2d\u4e89\u8bae\u533a\u57df',
  noWhistle: '\u8fd9\u90fd\u4e0d\u5439\uff1f',
  save: '\u95e8\u7ebf\u7ea7\u795e\u6251\u7533\u8bf7',
  hardKick: '\u52a8\u4f5c\u6709\u70b9\u5927\uff0c\u4f46\u60c5\u7eea\u5f88\u771f',
  varBias: 'VAR \u6b63\u5728\u627e\u89d2\u5ea6\u504f\u8892\u4f60\u4e3b\u961f',
  luck: '\u7384\u5b66\u52a0\u6301\uff1a\u4e0b\u4e00\u811a\u5fc5\u8fdb',
  passLeft: '\u4f60\u5f80\u5de6\u4f20\u554a\uff01',
  goal: 'GOAL!!!!!',
  cantCarry: '\u8fd9\u7403\u6211\u5976\u4e0d\u52a8\u4e86',
  watchScreen: '\u88c1\u5224\u4f60\u770b\u5c4f\u5e55\u554a',
  dna: '\u4e3b\u961f DNA \u52a8\u4e86',
  cameraBoot: '\u6b63\u5728\u542f\u52a8\u624b\u52bf\u88c1\u5224\u7cfb\u7edf',
  noCamera: '\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u6444\u50cf\u5934\uff0c\u5df2\u542f\u7528\u9f20\u6807\u62d6\u62fd\u6a21\u5f0f',
  ready: '\u79fb\u5230\u9053\u5177\u4e0a\u63e1\u62f3\u6293\u53d6\uff0c\u79fb\u51fa\u753b\u9762\u91ca\u653e',
  fallback: '\u6444\u50cf\u5934\u6216\u624b\u52bf\u6a21\u578b\u672a\u5c31\u7eea\uff0c\u5df2\u542f\u7528\u9f20\u6807\u62d6\u62fd\u6a21\u5f0f',
  scoreLabel: '\u6bd4\u8d5b\u6bd4\u5206',
  pitchLabel: '\u6a21\u62df\u76f4\u64ad\u753b\u9762',
  replay: '\u6162\u52a8\u4f5c\u4e89\u8bae\u56de\u653e',
  gesturePower: '\u624b\u52bf\u5f3a\u5ea6',
  locked: '\u9053\u5177\u9501\u5b9a',
  waiting: '\u7b49\u5f85\u6293\u53d6',
  toolbox: '\u88c1\u5224\u88c5\u5907\u53f0',
  quickGuide:
    '\u5feb\u6377\u624b\u52bf\uff1a\u53f3\u624b\u634f\u5408=\u9ec4\u724c\uff0c\u5de6\u624b\u634f\u5408=\u7ea2\u724c\uff0c\u53cc\u624b\u98df\u6307\u753b\u6846=VAR\uff0c\u63e1\u62f3\u540e\u5f20\u5f00=\u9e21\u86cb\uff0c\u6bd4\u516d/\u70b9\u8d5e=GOAL',
} as const

const tools: ToolItem[] = [
  {
    id: 'red-card',
    label: text.redCard,
    icon: cp(0x1f7e5),
    effectType: 'card',
    defaultMessage: text.directRed,
  },
  {
    id: 'yellow-card',
    label: text.yellowCard,
    icon: cp(0x1f7e8),
    effectType: 'card',
    defaultMessage: text.warning,
  },
  {
    id: 'egg',
    label: text.egg,
    icon: cp(0x1f95a),
    effectType: 'egg',
    defaultMessage: text.eggHit,
  },
  {
    id: 'glove',
    label: text.glove,
    icon: cp(0x1f9e4),
    effectType: 'glove',
    defaultMessage: text.save,
  },
  {
    id: 'kick',
    label: text.kick,
    icon: cp(0x1f9b6),
    effectType: 'kick',
    defaultMessage: text.hardKick,
  },
  {
    id: 'var',
    label: 'VAR',
    icon: cp(0x1f4fa),
    effectType: 'var',
    defaultMessage: text.varBias,
  },
]

const playerDots = [
  { x: 18, y: 35, team: 'home', delay: '0s' },
  { x: 34, y: 52, team: 'home', delay: '-1.4s' },
  { x: 49, y: 32, team: 'home', delay: '-2.8s' },
  { x: 62, y: 64, team: 'home', delay: '-4s' },
  { x: 78, y: 42, team: 'away', delay: '-.8s' },
  { x: 67, y: 28, team: 'away', delay: '-2.1s' },
  { x: 52, y: 71, team: 'away', delay: '-3.2s' },
  { x: 28, y: 69, team: 'away', delay: '-4.5s' },
]

const throwMessages = [text.passLeft, text.cantCarry, text.watchScreen, text.dna]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function getToolAtPoint(point: Vec) {
  const stack = document.elementsFromPoint(point.x, point.y)
  const target = stack.find((element) => element instanceof HTMLElement && element.dataset.toolId)
  return target instanceof HTMLElement ? target.dataset.toolId ?? null : null
}

function getNearestToolAtPoint(point: Vec, maxDistance = 82) {
  const directHit = getToolAtPoint(point)
  if (directHit) return directHit

  const toolButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tool-id]'))
  let closest: { toolId: string; distance: number } | null = null

  for (const button of toolButtons) {
    const bounds = button.getBoundingClientRect()
    const center = {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    }
    const gap = distance(point, center)

    if (gap <= maxDistance && (!closest || gap < closest.distance)) {
      closest = {
        toolId: button.dataset.toolId ?? '',
        distance: gap,
      }
    }
  }

  return closest?.toolId || null
}

function getMessage(tool: ToolItem) {
  if (tool.effectType === 'speaker') {
    return throwMessages[Math.floor(Math.random() * throwMessages.length)]
  }

  return tool.defaultMessage
}

function midpoint(a: Vec, b: Vec) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function getCenterStagePoint() {
  const broadcast = document.querySelector('.broadcast')?.getBoundingClientRect()
  if (broadcast) {
    return {
      x: broadcast.left + broadcast.width / 2,
      y: broadcast.top + broadcast.height / 2,
    }
  }

  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }
}

function getBroadcastReleasePoint(previewPoint: Vec | null) {
  const broadcast = document.querySelector('.broadcast')?.getBoundingClientRect()
  if (!broadcast || !previewPoint) return getCenterStagePoint()

  return {
    x: broadcast.left + clamp(previewPoint.x, 0.08, 0.92) * broadcast.width,
    y: broadcast.top + clamp(previewPoint.y, 0.12, 0.88) * broadcast.height,
  }
}

function getHandedness(label: string | undefined, point: Vec): HandSnapshot['handedness'] {
  if (label === 'Left' || label === 'Right') return label

  return point.x > window.innerWidth / 2 ? 'Right' : 'Left'
}

function mapPreviewPointToScreen(point: Vec, container: HTMLElement | null) {
  const bounds = container?.getBoundingClientRect()
  if (!bounds) return point

  return {
    x: bounds.left + point.x * bounds.width,
    y: bounds.top + point.y * bounds.height,
  }
}

function isPreviewPointOutside(point: Vec) {
  return point.x < 0.055 || point.x > 0.945 || point.y < 0.055 || point.y > 0.945
}

function getExtendedFingerCount(landmarks: Vec[], wrist: Vec) {
  const fingers = [
    { tip: 8, pip: 6 },
    { tip: 12, pip: 10 },
    { tip: 16, pip: 14 },
    { tip: 20, pip: 18 },
  ]

  return fingers.filter(({ tip, pip }) => isFingerExtended(landmarks, wrist, tip, pip)).length
}

function isFingerExtended(landmarks: Vec[], wrist: Vec, tip: number, pip: number) {
  return distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) + 26
}

function isThumbExtended(landmarks: Vec[], wrist: Vec) {
  return distance(landmarks[4], wrist) > distance(landmarks[2], wrist) + 30
}

function getGoalGestureCandidate(
  hands: HandSnapshot[],
  state: GoalGestureState,
  now: number,
): GestureCandidate | null {
  const goalHand = hands.find((hand) => hand.isSix || hand.isThumbsUp)

  if (!goalHand) {
    state.toolId = null
    state.frames = 0
    return null
  }

  const sameGesture = state.toolId === 'goal'
  state.toolId = 'goal'
  state.frames = sameGesture ? state.frames + 1 : 1

  if (state.frames >= 8 && now - state.lastFiredAt > 2800) {
    state.frames = 0
    state.lastFiredAt = now
    return { toolId: 'goal', velocity: goalHand.velocity }
  }

  return null
}

function getEggGestureCandidate(
  hands: HandSnapshot[],
  states: Map<string, EggGestureState>,
  now: number,
): GestureCandidate | null {
  for (const hand of hands) {
    const state = states.get(hand.id) ?? {
      fistFrames: 0,
      openFrames: 0,
      armed: false,
      lastFiredAt: 0,
    }

    if (hand.isFist) {
      state.fistFrames += 1
      state.openFrames = 0
      if (state.fistFrames >= 8) {
        state.armed = true
      }
    } else if (hand.isOpenPalm) {
      state.openFrames += 1
      if (state.armed && state.openFrames >= 5 && now - state.lastFiredAt > 2200) {
        state.lastFiredAt = now
        state.fistFrames = 0
        state.openFrames = 0
        state.armed = false
        states.set(hand.id, state)
        return { toolId: 'egg', velocity: hand.velocity }
      }
    } else {
      state.fistFrames = Math.max(0, state.fistFrames - 1)
      state.openFrames = 0
    }

    states.set(hand.id, state)
  }

  return null
}

function getQuickGestureCandidate(hands: HandSnapshot[]): GestureCandidate | null {
  if (hands.length >= 2) {
    const [first, second] = hands
    const handGap = distance(first.point, second.point)
    const similarHeight = Math.abs(first.point.y - second.point.y) < 150
    const bothIndexFrame = first.indexExtended && second.indexExtended && !first.isPinching && !second.isPinching

    if (bothIndexFrame && similarHeight && handGap > 220) {
      return {
        toolId: 'var',
        velocity: midpoint(first.velocity, second.velocity),
      }
    }
  }

  const pinchingHands = hands.filter((hand) => hand.isPinching)
  if (pinchingHands.length === 1) {
    const [hand] = pinchingHands
    if (!getToolAtPoint(hand.point)) {
      const toolId = hand.handedness === 'Left' ? 'red-card' : 'yellow-card'
      return { toolId, velocity: hand.velocity }
    }
  }

  return null
}

function App() {
  const appRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraCardRef = useRef<HTMLDivElement | null>(null)
  const activeToolRef = useRef<string | null>(null)
  const activeGrabHandIdRef = useRef<string | null>(null)
  const activeGrabPreviewPointRef = useRef<Vec | null>(null)
  const grabCandidateRef = useRef<GrabCandidateState>({
    handId: null,
    toolId: null,
    frames: 0,
  })
  const wasGrabbingRef = useRef(false)
  const sampleRef = useRef<{ point: Vec; time: number } | null>(null)
  const gestureVelocityRef = useRef<Vec>({ x: 0, y: 0 })
  const handSamplesRef = useRef<Map<number, { point: Vec; time: number }>>(new Map())
  const quickGestureRef = useRef<{
    toolId: QuickGesture | null
    frames: number
    lastFiredAt: number
  }>({ toolId: null, frames: 0, lastFiredAt: 0 })
  const goalGestureRef = useRef<GoalGestureState>({
    toolId: null,
    frames: 0,
    lastFiredAt: 0,
  })
  const eggGestureRef = useRef<Map<string, EggGestureState>>(new Map())
  const pointerDragRef = useRef(false)

  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [cameraMessage, setCameraMessage] = useState<string>(text.cameraBoot)
  const [gesture, setGesture] = useState<GestureState>({
    mode: 'idle',
    cursor: { x: 0, y: 0 },
    pinchStrength: 0,
    velocity: { x: 0, y: 0 },
    activeToolId: null,
  })
  const [effects, setEffects] = useState<OverlayEffect[]>([])
  const [detectedHands, setDetectedHands] = useState<HandSnapshot[]>([])
  const [matchInfo, setMatchInfo] = useState<MatchInfo>({
    homeTeam: 'CHN',
    awayTeam: 'ARG',
    homeScore: '2',
    awayScore: '1',
    clock: '87:34',
  })

  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [])
  const activeTool = gesture.activeToolId ? toolMap.get(gesture.activeToolId) : null

  useEffect(() => {
    gestureVelocityRef.current = gesture.velocity
  }, [gesture.velocity])

  useEffect(() => {
    trackVisit()
  }, [])

  const launchTool = useCallback(
    (toolId: string, point: Vec, velocity: Vec) => {
      const tool = toolMap.get(toolId)
      if (!tool) return

      const viewport = appRef.current?.getBoundingClientRect()
      const position = viewport
        ? {
            x: clamp(point.x, viewport.left + 42, viewport.right - 42),
            y: clamp(point.y, viewport.top + 42, viewport.bottom - 42),
          }
        : point

      const nextEffect: OverlayEffect = {
        id: `${toolId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        toolId,
        effectType: tool.effectType,
        position,
        velocity: {
          x: clamp(velocity.x, -1500, 1500),
          y: clamp(velocity.y, -1500, 1500),
        },
        createdAt: Date.now(),
        message: getMessage(tool),
      }

      setEffects((current) => [...current.slice(-9), nextEffect])
      activeToolRef.current = null
      activeGrabHandIdRef.current = null
      activeGrabPreviewPointRef.current = null
      grabCandidateRef.current.handId = null
      grabCandidateRef.current.toolId = null
      grabCandidateRef.current.frames = 0
      setGesture((current) => ({
        ...current,
        mode: 'released',
        activeToolId: null,
        cursor: point,
        velocity,
      }))
    },
    [toolMap],
  )

  const launchCenterTool = useCallback(
    (toolId: QuickGesture, velocity: Vec) => {
      const tool = toolMap.get(toolId)
      if (!tool && toolId !== 'goal') return

      const nextEffect: OverlayEffect = {
        id: `${toolId}-center-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        toolId,
        effectType: tool?.effectType ?? 'goal',
        position: getCenterStagePoint(),
        velocity: {
          x: clamp(velocity.x, -1500, 1500),
          y: clamp(velocity.y, -1500, 1500),
        },
        createdAt: Date.now(),
        message: tool ? getMessage(tool) : text.goal,
        isCenterStage: true,
        icon: toolId === 'goal' ? text.goal : undefined,
      }

      setEffects((current) => [...current.slice(-9), nextEffect])
    },
    [toolMap],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setEffects((current) => current.filter((effect) => now - effect.createdAt < 4800))
    }, 800)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let landmarker: HandLandmarker | null = null
    let stream: MediaStream | null = null

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('fallback')
        setCameraMessage(text.noCamera)
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        })

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        if (cancelled) return
        setCameraStatus('ready')
        setCameraMessage(text.cameraBoot)

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
        )

        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          numHands: 2,
          runningMode: 'VIDEO',
        })

        if (cancelled) return
        setCameraMessage(text.ready)

        const tick = () => {
          if (cancelled || !landmarker || !videoRef.current) return

          const videoEl = videoRef.current
          if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const result = landmarker.detectForVideo(videoEl, performance.now())
            const now = performance.now()
            const hands = result.landmarks.map<HandSnapshot>((hand, index) => {
              const indexTip = hand[8]
              const thumbTip = hand[4]
              const landmarks = hand.map((landmark) => ({
                x: (1 - landmark.x) * window.innerWidth,
                y: landmark.y * window.innerHeight,
              }))
              const previewLandmarks = hand.map((landmark) => ({
                x: 1 - landmark.x,
                y: landmark.y,
              }))
              const point = landmarks[8]
              const previewPoint = previewLandmarks[8]
              const thumb = landmarks[4]
              const wristPoint = landmarks[0]
              const previous = handSamplesRef.current.get(index)
              const delta = previous ? Math.max(now - previous.time, 16) : 16
              const velocity = previous
                ? {
                    x: ((point.x - previous.point.x) / delta) * 1000,
                    y: ((point.y - previous.point.y) / delta) * 1000,
                  }
                : { x: 0, y: 0 }
              const normalizedDistance = distance(
                { x: indexTip.x, y: indexTip.y },
                { x: thumbTip.x, y: thumbTip.y },
              )
              const pinchStrength = clamp(1 - normalizedDistance / 0.085, 0, 1)
              const extendedFingers = getExtendedFingerCount(landmarks, wristPoint)
              const thumbExtended = isThumbExtended(landmarks, wristPoint)
              const pinkyExtended = isFingerExtended(landmarks, wristPoint, 20, 18)
              const indexFolded = !isFingerExtended(landmarks, wristPoint, 8, 6)
              const middleFolded = !isFingerExtended(landmarks, wristPoint, 12, 10)
              const ringFolded = !isFingerExtended(landmarks, wristPoint, 16, 14)
              const noPinch = normalizedDistance > 0.095
              const thumbUp =
                thumbExtended &&
                noPinch &&
                indexFolded &&
                middleFolded &&
                ringFolded &&
                !pinkyExtended &&
                landmarks[4].y < wristPoint.y - 58 &&
                landmarks[4].y < landmarks[3].y - 18
              const six =
                thumbExtended &&
                pinkyExtended &&
                noPinch &&
                indexFolded &&
                middleFolded &&
                ringFolded &&
                distance(landmarks[4], landmarks[20]) > 118 &&
                distance(landmarks[8], landmarks[4]) > 92

              handSamplesRef.current.set(index, { point, time: now })

              return {
                id: `${getHandedness(result.handedness[index]?.[0]?.categoryName, point)}-${index}`,
                handedness: getHandedness(result.handedness[index]?.[0]?.categoryName, point),
                point,
                previewPoint,
                thumb,
                wrist: wristPoint,
                landmarks,
                previewLandmarks,
                pinchStrength,
                isPinching: normalizedDistance < 0.055,
                indexExtended: distance(point, wristPoint) > 112 && point.y < wristPoint.y - 18,
                thumbExtended,
                pinkyExtended,
                extendedFingers,
                isFist: extendedFingers <= 1 && pinchStrength < 0.65,
                isOpenPalm: extendedFingers >= 3 && pinchStrength < 0.45,
                isSix: six,
                isThumbsUp: thumbUp,
                velocity,
              }
            })

            if (hands.length > 0) {
              setDetectedHands(hands)
              const activeGrabHand = activeGrabHandIdRef.current
                ? hands.find((hand) => hand.id === activeGrabHandIdRef.current)
                : null
              const fistNearToolHand =
                activeToolRef.current || activeGrabHand
                  ? null
                  : hands.find((hand) => {
                      if (!hand.isFist || isPreviewPointOutside(hand.previewPoint)) return false
                      const handPoint = mapPreviewPointToScreen(hand.previewPoint, cameraCardRef.current)
                      return Boolean(getNearestToolAtPoint(handPoint))
                    })
              const trackingHand = activeGrabHand ?? fistNearToolHand ?? hands[0]
              const point = mapPreviewPointToScreen(trackingHand.previewPoint, cameraCardRef.current)
              const hoveredToolId = getNearestToolAtPoint(point)
              const candidate = activeToolRef.current || (hoveredToolId && trackingHand.isFist)
                ? null
                : getGoalGestureCandidate(hands, goalGestureRef.current, now) ??
                  getEggGestureCandidate(hands, eggGestureRef.current, now) ??
                  getQuickGestureCandidate(hands)

              if (candidate) {
                const quick = quickGestureRef.current
                const requiredFrames =
                  candidate.toolId === 'egg' || candidate.toolId === 'goal'
                    ? 1
                    : candidate.toolId === 'yellow-card'
                      ? 7
                      : 10
                const sameGesture = quick.toolId === candidate.toolId
                quick.toolId = candidate.toolId
                quick.frames = sameGesture ? quick.frames + 1 : 1

                if (quick.frames >= requiredFrames && now - quick.lastFiredAt > 1700) {
                  launchCenterTool(candidate.toolId, candidate.velocity)
                  quick.lastFiredAt = now
                  quick.frames = 0
                  quick.toolId = null
                }
              } else {
                quickGestureRef.current.toolId = null
                quickGestureRef.current.frames = 0
              }

              if (!activeToolRef.current && fistNearToolHand) {
                const grabPoint = mapPreviewPointToScreen(fistNearToolHand.previewPoint, cameraCardRef.current)
                const grabbedToolId = getNearestToolAtPoint(grabPoint)

                if (grabbedToolId) {
                  const grabCandidate = grabCandidateRef.current
                  const sameCandidate =
                    grabCandidate.handId === fistNearToolHand.id && grabCandidate.toolId === grabbedToolId
                  grabCandidate.handId = fistNearToolHand.id
                  grabCandidate.toolId = grabbedToolId
                  grabCandidate.frames = sameCandidate ? grabCandidate.frames + 1 : 1

                  if (grabCandidate.frames >= 5) {
                    activeToolRef.current = grabbedToolId
                    activeGrabHandIdRef.current = fistNearToolHand.id
                    activeGrabPreviewPointRef.current = fistNearToolHand.previewPoint
                    wasGrabbingRef.current = true
                    grabCandidate.frames = 0
                  }
                }
              } else if (!activeToolRef.current) {
                grabCandidateRef.current.handId = null
                grabCandidateRef.current.toolId = null
                grabCandidateRef.current.frames = 0
              }

              const currentGrabHand = activeGrabHandIdRef.current
                ? hands.find((hand) => hand.id === activeGrabHandIdRef.current)
                : null
              const activeToolId = activeToolRef.current

              if (activeToolId && currentGrabHand && isPreviewPointOutside(currentGrabHand.previewPoint)) {
                launchTool(activeToolId, getBroadcastReleasePoint(currentGrabHand.previewPoint), currentGrabHand.velocity)
                wasGrabbingRef.current = false
              } else if (activeToolId && activeGrabHandIdRef.current && !currentGrabHand) {
                launchTool(
                  activeToolId,
                  getBroadcastReleasePoint(activeGrabPreviewPointRef.current),
                  gestureVelocityRef.current.x || gestureVelocityRef.current.y
                    ? gestureVelocityRef.current
                    : { x: 0, y: -900 },
                )
                wasGrabbingRef.current = false
              } else {
                const cursorHand = currentGrabHand ?? trackingHand
                const cursorPoint = mapPreviewPointToScreen(cursorHand.previewPoint, cameraCardRef.current)
                const cursorVelocity = cursorHand.velocity
                const cursorToolId = activeToolRef.current
                activeGrabPreviewPointRef.current = currentGrabHand?.previewPoint ?? activeGrabPreviewPointRef.current
                setGesture({
                  mode: cursorToolId
                    ? 'dragging'
                    : hoveredToolId
                      ? 'hoverTool'
                      : 'idle',
                  cursor: cursorPoint,
                  pinchStrength: cursorHand.pinchStrength,
                  velocity: cursorVelocity,
                  activeToolId: cursorToolId,
                })
              }

              sampleRef.current = { point: getBroadcastReleasePoint(activeGrabPreviewPointRef.current), time: now }
            } else {
              setDetectedHands([])
              if (activeToolRef.current) {
                launchTool(
                  activeToolRef.current,
                  getBroadcastReleasePoint(activeGrabPreviewPointRef.current),
                  gestureVelocityRef.current.x || gestureVelocityRef.current.y
                    ? gestureVelocityRef.current
                    : { x: 0, y: -900 },
                )
              }
              activeToolRef.current = null
              activeGrabHandIdRef.current = null
              activeGrabPreviewPointRef.current = null
              grabCandidateRef.current.handId = null
              grabCandidateRef.current.toolId = null
              grabCandidateRef.current.frames = 0
              wasGrabbingRef.current = false
              handSamplesRef.current.clear()
              eggGestureRef.current.clear()
              goalGestureRef.current.toolId = null
              goalGestureRef.current.frames = 0
              quickGestureRef.current.toolId = null
              quickGestureRef.current.frames = 0
              setGesture((current) => ({
                ...current,
                mode: 'idle',
                pinchStrength: 0,
                activeToolId: null,
              }))
            }
          }

          raf = window.requestAnimationFrame(tick)
        }

        raf = window.requestAnimationFrame(tick)
      } catch (error) {
        console.warn(error)
        if (!cancelled) {
          setDetectedHands([])
          setCameraStatus('fallback')
          setCameraMessage(text.fallback)
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      stream?.getTracks().forEach((track) => track.stop())
      landmarker?.close()
    }
  }, [launchCenterTool, launchTool])

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!pointerDragRef.current || !activeToolRef.current) return
      const point = { x: event.clientX, y: event.clientY }
      const previous = sampleRef.current
      const now = performance.now()
      const delta = previous ? Math.max(now - previous.time, 16) : 16
      const velocity = previous
        ? {
            x: ((point.x - previous.point.x) / delta) * 1000,
            y: ((point.y - previous.point.y) / delta) * 1000,
          }
        : { x: 0, y: 0 }

      sampleRef.current = { point, time: now }
      setGesture({
        mode: 'dragging',
        cursor: point,
        pinchStrength: 1,
        velocity,
        activeToolId: activeToolRef.current,
      })
    }

    function handlePointerUp(event: globalThis.PointerEvent) {
      if (!pointerDragRef.current || !activeToolRef.current) return
      pointerDragRef.current = false
      launchTool(activeToolRef.current, { x: event.clientX, y: event.clientY }, gesture.velocity)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [gesture.velocity, launchTool])

  function beginPointerTool(toolId: string, event: ReactPointerEvent<HTMLButtonElement>) {
    pointerDragRef.current = true
    activeToolRef.current = toolId
    const point = { x: event.clientX, y: event.clientY }
    sampleRef.current = { point, time: performance.now() }
    setGesture({
      mode: 'grabbed',
      cursor: point,
      pinchStrength: 1,
      velocity: { x: 0, y: 0 },
      activeToolId: toolId,
    })
  }

  function updateMatchInfo(key: keyof MatchInfo, value: string) {
    setMatchInfo((current) => ({
      ...current,
      [key]: value,
    }))
  }

  return (
    <main ref={appRef} className="stadium-app">
      <section className="broadcast">
        <div className="scorebug" aria-label={text.scoreLabel}>
          <input
            className="score-team score-input"
            value={matchInfo.homeTeam}
            maxLength={6}
            aria-label="Home team"
            onChange={(event) => updateMatchInfo('homeTeam', event.target.value.toUpperCase())}
          />
          <div className="score-main">
            <input
              className="score-number score-input"
              value={matchInfo.homeScore}
              inputMode="numeric"
              maxLength={2}
              aria-label="Home score"
              onChange={(event) => updateMatchInfo('homeScore', event.target.value.replace(/\D/g, ''))}
            />
            <span>-</span>
            <input
              className="score-number score-input"
              value={matchInfo.awayScore}
              inputMode="numeric"
              maxLength={2}
              aria-label="Away score"
              onChange={(event) => updateMatchInfo('awayScore', event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <input
            className="score-team score-input"
            value={matchInfo.awayTeam}
            maxLength={6}
            aria-label="Away team"
            onChange={(event) => updateMatchInfo('awayTeam', event.target.value.toUpperCase())}
          />
          <input
            className="match-clock score-input"
            value={matchInfo.clock}
            maxLength={8}
            aria-label="Match clock"
            onChange={(event) => updateMatchInfo('clock', event.target.value)}
          />
        </div>

        <div className="broadcast-tag">
          <Radio size={15} />
          FAN REFEREE LIVE
        </div>

        <div className="pitch" aria-label={text.pitchLabel}>
          <div className="center-line" />
          <div className="center-circle" />
          <div className="penalty-box left" />
          <div className="penalty-box right" />
          <div className="ball" />
          {playerDots.map((player, index) => (
            <span
              key={`${player.team}-${index}`}
              className={`player-dot ${player.team}`}
              style={
                {
                  '--x': `${player.x}%`,
                  '--y': `${player.y}%`,
                  '--delay': player.delay,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="control-strip">
          <span>
            <Activity size={14} />
            {text.replay}
          </span>
          <span>
            <Gauge size={14} />
            {text.gesturePower} {(gesture.pinchStrength * 100).toFixed(0)}%
          </span>
          <span>
            <Crosshair size={14} />
            {gesture.mode === 'dragging' ? text.locked : text.waiting}
          </span>
        </div>
      </section>

      <aside className="toolbox" aria-label={text.toolbox}>
        <div className="panel-title">
          <ShieldAlert size={18} />
          <span>{text.toolbox}</span>
          <i />
        </div>

        <div ref={cameraCardRef} className={`camera-card ${cameraStatus}`}>
          <video ref={videoRef} className="camera-preview" muted playsInline />
          <svg className="camera-skeleton-layer" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            {detectedHands.map((hand) => (
              <g key={hand.id} className={`camera-hand-skeleton ${hand.handedness.toLowerCase()}`}>
                {handConnections.map(([start, end]) => (
                  <line
                    key={`${start}-${end}`}
                    x1={hand.previewLandmarks[start].x}
                    y1={hand.previewLandmarks[start].y}
                    x2={hand.previewLandmarks[end].x}
                    y2={hand.previewLandmarks[end].y}
                  />
                ))}
                {hand.previewLandmarks.map((point, index) => (
                  <circle
                    key={index}
                    className={index === 4 || index === 8 ? 'primary-joint' : ''}
                    cx={point.x}
                    cy={point.y}
                    r={index === 4 || index === 8 ? 0.014 : 0.009}
                  />
                ))}
              </g>
            ))}
          </svg>
          <div className="tool-grid camera-tools">
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`tool-button ${gesture.activeToolId === tool.id ? 'active' : ''}`}
                data-tool-id={tool.id}
                onPointerDown={(event) => beginPointerTool(tool.id, event)}
                title={`${tool.label}: ${tool.defaultMessage}`}
              >
                <span className="tool-icon">{tool.icon}</span>
                <span className="tool-label">{tool.label}</span>
              </button>
            ))}
          </div>
          <div className="camera-copy">
            {cameraStatus === 'ready' ? <Camera size={16} /> : <CameraOff size={16} />}
            <span>{cameraMessage}</span>
          </div>
        </div>

        <div className="quick-guide">{text.quickGuide}</div>
      </aside>

      <div
        className={`gesture-cursor ${gesture.mode}`}
        style={{ transform: `translate3d(${gesture.cursor.x}px, ${gesture.cursor.y}px, 0)` }}
        aria-hidden="true"
      >
        <span style={{ transform: `scale(${0.75 + gesture.pinchStrength * 0.35})` }} />
      </div>

      {activeTool && (
        <div
          className="dragged-tool"
          style={{ transform: `translate3d(${gesture.cursor.x}px, ${gesture.cursor.y}px, 0)` }}
          aria-hidden="true"
        >
          {activeTool.icon}
        </div>
      )}

      <div className="effects-layer" aria-live="polite">
        {effects.map((effect) => (
          <div
            key={effect.id}
            className={`effect effect-${effect.effectType} effect-${effect.toolId} ${
              effect.isCenterStage ? 'center-stage' : ''
            }`}
            style={
              {
                left: effect.position.x,
                top: effect.position.y,
                '--vx': `${effect.velocity.x * 0.03}px`,
                '--vy': `${effect.velocity.y * 0.03}px`,
              } as CSSProperties
            }
          >
            {effect.effectType === 'var' && <ScanLine size={28} />}
            <strong>{effect.icon ?? toolMap.get(effect.toolId)?.icon}</strong>
            <span>{effect.message}</span>
            {effect.effectType === 'egg' && <i />}
          </div>
        ))}
      </div>
    </main>
  )
}

export default App
