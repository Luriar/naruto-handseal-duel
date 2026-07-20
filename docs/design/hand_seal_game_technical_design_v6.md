# 웹캠 기반 인술 대전 게임 기술 구현 설계 v6

## 0. 문서 목적

이 문서는 웹캠으로 손 인을 인식하고, 술법 시퀀스를 판정하는 팬 프로젝트의 **현재 기준 단일 기술 설계 문서**다. v6는 v5.2의 single source of truth 구조를 유지하면서, 기획 v6의 β 원칙(모든 공식 매체 = 정전, variant 구조 도입)에 맞춰 데이터 모델을 확장한다.

기술 목표:

```text
웹캠
→ 손 랜드마크 추출
→ 인 분류
→ 안정화
→ 시퀀스 판정 (variant-aware)
→ 호화구 발동/실패 판정
→ raw replay 저장 (사용된 variant 메타 포함)
```

### v5.2 대비 주요 변경

```text
1. Jutsu 타입을 JutsuVariant 배열 구조로 확장 (§8)
2. variant별 출처 메타데이터 (canonStatus, sourceReference, verificationStatus) 도입
3. 캐스팅 단계 매핑을 variant별로 분리 (§9)
4. 페이크 브랜치 데이터 구조를 variant 참조 가능하도록 확장 (§16)
5. CastProgress에 사용된 variantId 명시 (§10)
6. Raw replay에 사용된 variant 메타 저장 (§14)
```

---

## 1. 전체 시스템 구조

```text
Webcam
↓
MediaPipe Hand Landmarker
↓
손 21개 랜드마크 추출
↓
랜드마크 정규화
↓
인 분류기
↓
Snake / Ram / Monkey / Boar / Horse / Tiger / Unknown
↓
안정화 / 중복 입력 방지
↓
시퀀스 판정기 (variant-aware)
↓
호화구 Lv.1~Lv.4 variant 중 활성된 것과 매칭
↓
호화구 성공 / 실패 / 중단 / 술식 붕괴
↓
게임 UI / 점수 / 이펙트 / raw replay 로그 (variant 메타 포함)
```

---

## 2. 추천 기술 스택

```text
Frontend: React + Vite + TypeScript
Camera: navigator.mediaDevices.getUserMedia
Hand Tracking: MediaPipe Tasks Vision / Hand Landmarker
Overlay: Canvas
State: Zustand 또는 React state
Classifier: 1단계 룰 기반 → 2단계 ML 모델
Data 저장: JSON / IndexedDB / 로컬 파일 export
Analysis: confusion matrix / precision / recall 계산
```

---

## 3. 프로젝트 폴더 구조

```text
src/
  app/
    App.tsx

  camera/
    WebcamView.tsx
    useWebcam.ts

  hand-tracking/
    handLandmarker.ts
    landmarkTypes.ts
    normalizeLandmarks.ts

  seal-recognition/
    sealTypes.ts
    ruleBasedSealClassifier.ts
    mlSealClassifier.ts
    sealStabilizer.ts
    sealFailureReason.ts
    confusionMatrix.ts

  jutsu/
    jutsuTypes.ts
    jutsuVariant.ts
    jutsuBook.ts
    sequenceMatcher.ts
    castingPhase.ts
    canonMetadata.ts

  game/
    gameState.ts
    scoring.ts
    battleEvents.ts
    chakraSystem.ts
    balanceStatus.ts

  opponent/
    dummyOpponent.ts
    opponentCastingStrip.ts
    shadowDuelScenario.ts
    handDisclosure.ts

  replay/
    eventLog.ts
    rawReplay.ts
    replayTimeline.ts

  ui/
    SealGuide.tsx
    JutsuProgress.tsx
    DebugLandmarkOverlay.tsx
    ResultPanel.tsx
    OpponentHandView.tsx
    CastingStrip.tsx
    JutsuVariantSelector.tsx
    SourceReferenceTooltip.tsx
```

---

## 4. MVP 정의

### 4.1 MVP 0: Seal Recognition Feasibility Spike

대상 인:

```text
Snake / Ram / Monkey / Boar / Horse / Tiger / Unknown
```

필수 기능:

```text
1. 웹캠 켜기
2. 손 랜드마크 표시
3. 라벨별 데이터 수집
4. 6개 인 분류
5. 인식 결과 로그 저장
6. confusion matrix 출력
7. 인별 precision / recall 출력
8. 실패 원인 분류
```

완료 기준 예시:

```text
각 인 precision 0.80 이상
각 인 recall 0.75 이상
Unknown recall 0.80 이상
false confirm rate 5% 이하
사용자 3명 이상에서 재현 가능
```

### 4.2 MVP 1: 호화구 수련장

```text
1. 웹캠 켜기
2. 손 랜드마크 표시
3. 현재 인식된 인 표시
4. Lv.1 표준형 (사→미→신→해→오→인) 시퀀스 활성
5. 순서대로 입력하면 진행
6. 틀리면 술식 붕괴
7. 중간에 멈추면 차크라 조형 중단
8. 성공하면 화염 이펙트
9. 시간 / 정확도 / 안정성 점수 표시
10. raw replay 저장
11. 사용된 variant 출처 표시 (Lv.1 → 만화)

MVP 1에서는 데이터 구조 차원에서 5가지 variant 모두 정의하나,
게임 활성 상태는 Lv.1만 isActive=true로 둔다.
```

### 4.3 MVP 1.5: Shadow Duel

```text
1. Lv.1 + Lv.2 variant 활성
2. 플레이어 사전 variant 선택 UI
3. AI 더미가 두 variant 중 무작위 시전
4. 상대 캐스팅 스트립 표시
5. 상대 손 실루엣 또는 인 아이콘 표시
6. 플레이어가 방어/회피/체술 끊기 중 선택 (키 입력)
7. 카운터 성공/실패 판정
8. 속도/술법/페이크 패턴 랜덤화
```

### 4.4 MVP 2: 기본 카운터 전투

```text
1. Lv.1 + Lv.2 + Lv.3 variant 활성
2. 호화구 / 방어술 / 바꿔치기 / 체술 끊기 최소 루프
3. HP 시스템 도입
4. 거리/위치 시스템 도입
5. variant별 밸런스 차등 적용
```

---

## 5. 데이터 수집

### 5.1 타입

```ts
type Seal =
  | "rat"
  | "ox"
  | "tiger"
  | "rabbit"
  | "dragon"
  | "snake"
  | "horse"
  | "ram"
  | "monkey"
  | "rooster"
  | "dog"
  | "boar"
  | "unknown";

type SealLabel = Seal;

const MVP_0_TARGET_SEALS: Seal[] = [
  "snake",
  "ram",
  "monkey",
  "boar",
  "horse",
  "tiger",
];

type LandmarkPoint = {
  x: number;
  y: number;
  z: number;
};

type HandSample = {
  handedness: "Left" | "Right";
  landmarks: LandmarkPoint[];
};

type CaptureCondition = {
  lighting: "bright" | "normal" | "dark";
  cameraAngle: "front" | "slightly_top" | "slightly_bottom";
  userId?: string;
};

type SealSample = {
  label: SealLabel;
  timestamp: number;
  hands: HandSample[];
  condition?: CaptureCondition;
};
```

### 5.2 샘플 목표

```text
각 인당 200~500개 샘플
Unknown 500개 이상
전환 중간 동작도 Unknown 또는 Transition으로 저장
```

---

## 6. 인식 실패 타입

```ts
type RecognitionFailureReason =
  | "low_confidence"
  | "hands_lost"
  | "one_hand_missing"
  | "off_center"
  | "occlusion"
  | "ambiguous_between_seals"
  | "wrong_seal"
  | "timeout"
  | "none";
```

---

## 7. 안정화와 중복 입력 방지

```ts
const CONFIDENCE_THRESHOLD = 0.75;
const MIN_STABLE_FRAMES = 8;
```

입력 상태 머신:

```text
Ready
↓
SealDetected
↓
SealConfirmed
↓
WaitForRelease
↓
Ready
```

릴리즈 조건:

```text
Unknown 상태가 일정 프레임 이상 지속
이전 인과 다른 후보가 안정적으로 등장
손 위치가 전환 상태로 감지됨
```

---

## 8. 술법 데이터 구조 (variant 구조)

### 8.1 기본 enum

```ts
type ActivationType =
  | "hand_seal_sequence"          // 인 시퀀스형
  | "chakra_control"              // 무인 차크라 제어형
  | "taijutsu_motion"             // 체술형
  | "genjutsu_trigger"            // 환술형
  | "clone_or_deception"          // 분신/기만형
  | "summoning_contract"          // 소환/계약형
  | "sealing_or_barrier_formula"; // 봉인/결계형

type CanonStatus =
  | "manga"
  | "anime"
  | "databook"
  | "game"
  | "fan_interpretation"
  | "game_interpretation";

type VerificationStatus =
  | "verified"           // 1차 자료 직접 확인 완료
  | "cross_referenced"   // 위키 등 2차 자료 교차 검증
  | "claimed"            // 출처 주장됨, 미검증
  | "needs_research";    // 추후 조사 필요

type MvpActivation =
  | "mvp_1"
  | "mvp_1_5"
  | "mvp_2"
  | "post_mvp"
  | "data_only";         // 데이터로만 보유, 게임 내 비활성
```

### 8.2 Seal 타입

```ts
// Seal은 12지 전체를 타입으로 열어둔다.
// MVP 0~1의 실제 인식 대상은 MVP_0_TARGET_SEALS에 한정한다.
type Seal =
  | "rat"
  | "ox"
  | "tiger"
  | "rabbit"
  | "dragon"
  | "snake"
  | "horse"
  | "ram"
  | "monkey"
  | "rooster"
  | "dog"
  | "boar"
  | "unknown";
```

### 8.3 SourceReference

```ts
type SourceReference = {
  description: string;           // 사람이 읽을 출처 설명
  mediaTitle?: string;           // "Naruto: Shippūden", "Rin no Sho" 등
  episodeOrChapter?: string;     // "Episode 15", "Chapter 232" 등
  publisherOrStudio?: string;    // "Shueisha", "Pierrot" 등
  publishedDate?: string;        // "2002-07" 등
  note?: string;                 // 추가 메모 (예: 효노쇼는 데이터북 아님)
};
```

### 8.4 JutsuVariant

```ts
type JutsuVariant = {
  variantId: string;             // "great_fireball_lv1" 등
  parentJutsuId: string;         // "great_fireball"
  gameLevel: 1 | 2 | 3 | 4;      // 게임 레벨
  displayNameKo: string;         // "Lv.1 표준형"
  displayNameEn?: string;        // "Lv.1 Standard Form"
  seals: Seal[];                 // 인 시퀀스
  canonStatus: CanonStatus;
  sourceReference: SourceReference;
  verificationStatus: VerificationStatus;
  mvpActivation: MvpActivation;
  isActiveInGame: boolean;       // 현재 빌드에서 게임 내 활성 여부
  operationOptions?: {           // Lv.3+ 운용 옵션 (선택)
    recoveryReduction?: boolean;
    chakraEfficiencyBonus?: boolean;
    failurePenaltyReduction?: boolean;
    midCancelEnabled?: boolean;
    fakeBranchEnabled?: boolean;
    chargeBranchEnabled?: boolean;
    counterRecoveryBonus?: boolean;
  };
};
```

### 8.5 Jutsu

```ts
type Jutsu = {
  id: string;
  nameKo: string;
  nameEn?: string;
  activationType: ActivationType;
  element?: "fire" | "water" | "wind" | "lightning" | "earth" | "yin" | "yang" | "none";
  variants: JutsuVariant[];      // β 원칙: 모든 매체별 시퀀스를 variant로 보유
  defaultVariantId: string;      // 게임 내 기본 노출 variant
  loreNote?: string;             // 술법 자체에 대한 설명 (출처 무관)
};
```

### 8.6 호화구 정의

```ts
const GREAT_FIREBALL: Jutsu = {
  id: "great_fireball",
  nameKo: "화둔·호화구의 술",
  nameEn: "Fire Release: Great Fireball Technique",
  activationType: "hand_seal_sequence",
  element: "fire",
  defaultVariantId: "great_fireball_lv1",
  loreNote: "우치하 일족의 성인식 술법. 만화에서는 우치하만 사용, 애니에서는 비우치하도 사용.",
  variants: [
    {
      variantId: "great_fireball_lv1",
      parentJutsuId: "great_fireball",
      gameLevel: 1,
      displayNameKo: "Lv.1 표준형",
      displayNameEn: "Lv.1 Standard Form",
      seals: ["snake", "ram", "monkey", "boar", "horse", "tiger"],
      canonStatus: "manga",
      sourceReference: {
        description: "우치하 일족 일반 사용 사례 (사스케 첫 시전 등)",
        mediaTitle: "Naruto Manga",
        note: "만화 전반의 우치하 사용 장면. 사스케 첫 시전이 가장 잘 알려진 사례.",
      },
      verificationStatus: "cross_referenced",
      mvpActivation: "mvp_1",
      isActiveInGame: true,
    },
    {
      variantId: "great_fireball_lv2",
      parentJutsuId: "great_fireball",
      gameLevel: 2,
      displayNameKo: "Lv.2 단축형",
      displayNameEn: "Lv.2 Short Form",
      seals: ["boar", "horse", "tiger"],
      canonStatus: "anime",
      sourceReference: {
        description: "이타치가 카카시/나루토/사쿠라/치요 일행과의 전투에서 사용",
        mediaTitle: "Naruto: Shippūden",
        episodeOrChapter: "Episode 15",
        publisherOrStudio: "Studio Pierrot",
      },
      verificationStatus: "cross_referenced",
      mvpActivation: "mvp_1_5",
      isActiveInGame: false,
      operationOptions: {
        recoveryReduction: true,
        chakraEfficiencyBonus: true,
        failurePenaltyReduction: true,
      },
    },
    {
      variantId: "great_fireball_lv3",
      parentJutsuId: "great_fireball",
      gameLevel: 3,
      displayNameKo: "Lv.3 마스터형",
      displayNameEn: "Lv.3 Master Form",
      seals: ["horse", "tiger"],
      canonStatus: "databook",
      sourceReference: {
        description: "공식 데이터북 1권 (린노쇼) 기재",
        mediaTitle: "Hiden: Rin no Sho (1st Databook)",
        publisherOrStudio: "Shueisha",
        publishedDate: "2002-07",
      },
      verificationStatus: "cross_referenced",
      mvpActivation: "mvp_2",
      isActiveInGame: false,
      operationOptions: {
        recoveryReduction: true,
        chakraEfficiencyBonus: true,
        midCancelEnabled: true,
        fakeBranchEnabled: true,
      },
    },
    {
      variantId: "great_fireball_lv4",
      parentJutsuId: "great_fireball",
      gameLevel: 4,
      displayNameKo: "Lv.4 전설형",
      displayNameEn: "Lv.4 Legendary Form",
      seals: ["tiger"],
      canonStatus: "databook",
      sourceReference: {
        description: "효노쇼 기재",
        mediaTitle: "Hyō no Sho (1st Fanbook)",
        publisherOrStudio: "Shueisha",
        note: "효노쇼는 정식 데이터북 시리즈(린노쇼/토노쇼/샤노쇼/진노쇼)와는 별개의 팬북이다.",
      },
      verificationStatus: "cross_referenced",
      mvpActivation: "post_mvp",
      isActiveInGame: false,
    },
  ],
};
```

### 8.7 비활성 variant 처리

```ts
// variant 활성 상태 확인 유틸
function getActiveVariants(jutsu: Jutsu): JutsuVariant[] {
  return jutsu.variants.filter(v => v.isActiveInGame);
}

// 현재 MVP에 따라 활성화 일괄 설정
function activateVariantsForMvp(jutsu: Jutsu, currentMvp: MvpActivation): void {
  const mvpOrder: MvpActivation[] = ["mvp_1", "mvp_1_5", "mvp_2", "post_mvp"];
  const currentIdx = mvpOrder.indexOf(currentMvp);
  jutsu.variants.forEach(v => {
    const variantIdx = mvpOrder.indexOf(v.mvpActivation);
    v.isActiveInGame = variantIdx >= 0 && variantIdx <= currentIdx;
  });
}
```

---

## 9. 캐스팅 단계 매핑 (variant별)

```ts
type CastingPhase =
  | "preparation"
  | "formation"
  | "condensation"
  | "release";

type SealPhaseMapping = {
  phase: CastingPhase;
  sealIndexStart: number;
  sealIndexEnd: number;
  description: string;
};

type VariantPhaseMapping = {
  variantId: string;
  phases: SealPhaseMapping[];
};
```

호화구 variant별 단계 매핑:

```ts
const GREAT_FIREBALL_PHASE_MAPPINGS: VariantPhaseMapping[] = [
  {
    variantId: "great_fireball_lv1",
    phases: [
      { phase: "preparation", sealIndexStart: 0, sealIndexEnd: 0, description: "사 / Snake. 술법 시작." },
      { phase: "formation", sealIndexStart: 1, sealIndexEnd: 4, description: "미→신→해→오. 차크라 조형." },
      { phase: "condensation", sealIndexStart: 5, sealIndexEnd: 5, description: "인 / Tiger 직후 응집 윈도우." },
      { phase: "release", sealIndexStart: 6, sealIndexEnd: 6, description: "화염 방사." },
    ],
  },
  {
    variantId: "great_fireball_lv2",
    phases: [
      { phase: "preparation", sealIndexStart: 0, sealIndexEnd: 0, description: "해 / Boar. 술법 시작." },
      { phase: "formation", sealIndexStart: 1, sealIndexEnd: 1, description: "오 / Horse. 차크라 조형 (단축)." },
      { phase: "condensation", sealIndexStart: 2, sealIndexEnd: 2, description: "인 / Tiger 직후 응집 윈도우." },
      { phase: "release", sealIndexStart: 3, sealIndexEnd: 3, description: "화염 방사." },
    ],
  },
  {
    variantId: "great_fireball_lv3",
    phases: [
      { phase: "preparation", sealIndexStart: 0, sealIndexEnd: 0, description: "오 / Horse. 술법 시작." },
      // formation 단계 생략 — 2개 인은 조형 단계가 없다
      { phase: "condensation", sealIndexStart: 1, sealIndexEnd: 1, description: "인 / Tiger 직후 응집 윈도우." },
      { phase: "release", sealIndexStart: 2, sealIndexEnd: 2, description: "화염 방사." },
    ],
  },
  {
    variantId: "great_fireball_lv4",
    phases: [
      // 1개 인은 preparation + condensation을 통합 단계로 처리 — 게임 균형 별도 검토 필요
      { phase: "preparation", sealIndexStart: 0, sealIndexEnd: 0, description: "인 / Tiger. 준비-응집 통합 단계 (Lv.4 별도 검토)." },
      { phase: "release", sealIndexStart: 1, sealIndexEnd: 1, description: "화염 방사." },
    ],
  },
];
```

응집 윈도우:

```ts
type BalanceStatus =
  | "prototype_initial_value"
  | "playtest_candidate"
  | "locked_for_demo"
  | "released_balance";

type CondensationWindow = {
  variantId: string;
  minMs: number;
  maxMs: number;
  balanceStatus: BalanceStatus;
  note: string;
};

const GREAT_FIREBALL_CONDENSATION_WINDOWS: CondensationWindow[] = [
  {
    variantId: "great_fireball_lv1",
    minMs: 250,
    maxMs: 350,
    balanceStatus: "prototype_initial_value",
    note: "Lv.1 표준형 초기 테스트 값",
  },
  {
    variantId: "great_fireball_lv2",
    minMs: 180,
    maxMs: 280,
    balanceStatus: "prototype_initial_value",
    note: "Lv.2 단축형 초기 테스트 값",
  },
  {
    variantId: "great_fireball_lv3",
    minMs: 150,
    maxMs: 250,
    balanceStatus: "prototype_initial_value",
    note: "Lv.3 마스터형 초기 테스트 값",
  },
  {
    variantId: "great_fireball_lv4",
    minMs: 120,
    maxMs: 200,
    balanceStatus: "prototype_initial_value",
    note: "Lv.4 전설형 초기 테스트 값. 본격 도입 전 게임 균형 검토 필수.",
  },
];
```

---

## 10. 시퀀스 판정 (variant-aware)

```ts
type CastState =
  | "idle"
  | "casting"
  | "success"
  | "failed"
  | "cancelled";

type CastFailureReason =
  | "wrong_seal"
  | "timeout"
  | "hands_lost"
  | "manual_cancel"
  | "recognition_unstable";

type CastProgress = {
  jutsuId: string;
  variantId: string;             // β 원칙: 어느 variant를 시전 중인지 추적
  expectedIndex: number;
  confirmedSeals: Seal[];
  startedAt: number;
  endedAt?: number;
  mistakes: number;
  stabilityScore: number;
};
```

variant 선택 로직:

```text
1. 플레이어가 사전에 사용할 variant를 선택 (UI)
2. 시퀀스 입력 시작 시 해당 variant의 seals로 expectedIndex 추적
3. 다른 variant와의 자동 분기/부분 일치 인정 없음 (기획 §6.3)
4. variant 변경은 명시적 캔슬 후 재시작으로만 가능
```

variant 간 시퀀스 충돌 처리:

```text
Lv.1 (사→미→신→해→오→인) 시전 중 마지막 3개(해→오→인)가 Lv.2 시퀀스와 일치한다.
하지만 시작 variant가 Lv.1로 선언되었다면, 끝까지 Lv.1로 판정한다.
시작 시점의 variant 선택이 시전 전체의 기준이 된다.
```

---

## 11. 상대 손 정보 표시

```ts
type OpponentHandDisclosureMode =
  | "raw_video"
  | "landmark_silhouette"
  | "confirmed_seal_event"
  | "casting_strip_only";
```

| 모드 | 설명 | 추천 사용처 |
|---|---|---|
| raw_video | 상대 웹캠 손 영상을 직접 표시 | 로컬/친구전/관전 |
| landmark_silhouette | 랜드마크 좌표로 손 실루엣 렌더링 | 일반 온라인/랭크 |
| confirmed_seal_event | 확정 인 이벤트만 표시 | 네트워크 최소 모드 |
| casting_strip_only | 술법 진행도만 표시 | 하드코어/특수 룰 |

두 정보 채널:

```ts
type OpponentVisualChannel =
  | "hand_silhouette"
  | "casting_strip";
```

역할:

```text
hand_silhouette:
전환 중인 손동작을 포함한 연속적 추측 정보.
UI에는 흐릿하게 표시할 수 있지만 확정 기록으로 저장하지 않는다.

casting_strip:
확정된 인만 기록하는 이산적 확정 정보.
전투 판정과 리플레이의 기준 기록으로 사용한다.
```

---

## 12. Shadow Duel

```ts
type ShadowDuelHypothesis =
  | "visual_identification"
  | "reaction_fun"
  | "counter_timing_feasibility"
  | "dual_attention_load";

type CastSpeedProfile = "slow" | "normal" | "fast" | "randomized";
type DummyPatternType = "fixed" | "random_variant_pool" | "fake_branch" | "cancel_bait";

type ShadowDuelScenario = {
  id: string;
  name: string;
  hypothesisTargets: ShadowDuelHypothesis[];
  speedProfile: CastSpeedProfile;
  patternType: DummyPatternType;
  variantPool: string[];         // β 원칙: 사용 가능한 variantId 목록
  opponentActions: DummyOpponentAction[];
  expectedPlayerResponses: string[];
};
```

랜덤 속도:

```ts
type SealTimingRange = {
  minMs: number;
  maxMs: number;
};

const NORMAL_DUMMY_TIMING: SealTimingRange = {
  minMs: 450,
  maxMs: 750,
};
```

---

## 13. 차크라 초기 모델

```ts
type ChakraState = {
  current: number;
  max: number;
  regenPerSecond: number;
  isRegenBlocked: boolean;
  balanceStatus: BalanceStatus;
};

const INITIAL_CHAKRA: ChakraState = {
  current: 100,
  max: 100,
  regenPerSecond: 4,
  isRegenBlocked: false,
  balanceStatus: "prototype_initial_value",
};
```

variant별 술법 밸런스:

```ts
type VariantBalance = {
  variantId: string;
  chakraCost: number;
  damage: number;
  recoveryMs: number;
  failedCostRatio: number;
  cancelledCostRatio: number;
  balanceStatus: BalanceStatus;
  note: string;
};

const GREAT_FIREBALL_VARIANT_BALANCES: VariantBalance[] = [
  {
    variantId: "great_fireball_lv1",
    chakraCost: 25,
    damage: 30,
    recoveryMs: 800,
    failedCostRatio: 0.5,
    cancelledCostRatio: 0.25,
    balanceStatus: "prototype_initial_value",
    note: "MVP 1 기준 초기값. 단일 술법 환경.",
  },
  {
    variantId: "great_fireball_lv2",
    chakraCost: 34,
    damage: 30,
    recoveryMs: 600,
    failedCostRatio: 0.6,
    cancelledCostRatio: 0.3,
    balanceStatus: "prototype_initial_value",
    note: "단축의 대가로 차크라 효율 낮음, 실패 손실 큼.",
  },
  {
    variantId: "great_fireball_lv3",
    chakraCost: 38,
    damage: 32,
    recoveryMs: 500,
    failedCostRatio: 0.7,
    cancelledCostRatio: 0.35,
    balanceStatus: "prototype_initial_value",
    note: "추가 단축. 운용 유연성으로 보상.",
  },
  // Lv.4는 본격 도입 전 별도 밸런스 검토 필요
];
```

---

## 14. Raw Replay

```ts
type RawReplayFrame = {
  timestamp: number;
  videoFrameRef?: string;
  hands: HandSample[];
  rawPrediction: SealPrediction;
  stabilizedSeal: Seal;
  confidence: number;
  failureReason?: RecognitionFailureReason;
};

type RawReplaySession = {
  id: string;
  createdAt: string;
  mode: "recognition_lab" | "training_lab" | "shadow_duel";
  frames: RawReplayFrame[];
  confirmedSeals: {
    seal: Seal;
    timestamp: number;
    confidence: number;
  }[];
  usedVariant?: {                // β 원칙: 어느 variant가 시전되었는지
    variantId: string;
    jutsuId: string;
    canonStatus: CanonStatus;
    sourceReferenceDescription: string;
  };
  result?: {
    state: CastState;
    reason?: CastFailureReason;
  };
};
```

저장 정책:

```text
- 인 확정 순간 ±500ms 구간: 고밀도 샘플링 또는 풀 프레임
- 나머지 구간: 5fps 샘플링
- 기본 저장: landmark replay
- 선택 저장: 원본 영상 또는 프레임 이미지
- 실패 원인이 있는 프레임은 디버그 모드에서 videoFrameRef 저장을 강제한다
- 사용된 variant 메타는 항상 저장 (출처 추적용)
```

---

## 15. 한 손 모드 데이터 분리

```ts
type InputAccessibilityMode =
  | "two_hand_required"
  | "one_hand_accessibility";

type CharacterSealCapability =
  | "normal_two_hand"
  | "one_hand_seal_specialist"
  | "no_seal_chakra_control";

type PlayerInputProfile = {
  accessibilityMode: InputAccessibilityMode;
  characterCapability: CharacterSealCapability;
};
```

원칙:

```text
접근성 한 손 모드는 플레이 가능성 보장 목적이다.
캐릭터 한 손 인은 전투적 개성/우위 목적이다.
두 기능을 같은 밸런스 규칙에 묶지 않는다.
```

---

## 16. 페이크 브랜치 데이터 구조 (variant-aware)

12지 표준 enum에서는 유/酉 인을 `rooster`로 표기한다. Naruto 계열 자료에서 `Bird`로 부르는 경우가 있더라도 코드 enum에서는 alias를 만들지 않고 `rooster`로 통일한다.

```ts
type JutsuBranch = {
  fromSequence: Seal[];
  branches: {
    nextSeals: Seal[];
    resultVariantId?: string;    // β 원칙: variant 레벨로 참조
    actionType: "complete_variant" | "branch_to_variant" | "cancel" | "bait";
    canonStatus: CanonStatus;
    sourceReference?: SourceReference;
  }[];
};
```

예시:

```ts
const FIRE_STYLE_BRANCH_EXAMPLE: JutsuBranch = {
  fromSequence: ["snake", "ram", "monkey"],
  branches: [
    {
      nextSeals: ["boar", "horse", "tiger"],
      resultVariantId: "great_fireball_lv1",
      actionType: "complete_variant",
      canonStatus: "manga",
      sourceReference: {
        description: "만화 일반 호화구 시퀀스의 후반부",
      },
    },
    {
      nextSeals: ["rooster", "dog"],
      resultVariantId: "fire_feint_projectile_lv1",
      actionType: "branch_to_variant",
      canonStatus: "game_interpretation",
      sourceReference: {
        description: "본 프로젝트 자체 게임 디자인. 검증된 원작 시퀀스 아님.",
      },
    },
    {
      nextSeals: [],
      actionType: "cancel",
      canonStatus: "game_interpretation",
      sourceReference: {
        description: "본 프로젝트 자체 게임 디자인. 캔슬 운용 패턴.",
      },
    },
  ],
};
```

페이크 브랜치 주의:

```text
β 원칙에 따라 호화구의 5가지 variant는 각각 독립적으로 시작되어야 한다.
페이크 브랜치는 "호화구를 다른 술법으로 분기하는 것"을 의미하며,
같은 호화구 내의 variant 간 분기는 페이크 브랜치 시스템의 대상이 아니다.
```

---

## 17. 구현 로드맵

```text
Step 0 — MVP 0: 인식 가능성 검증
Step 1 — 웹캠 + 손 랜드마크
Step 2 — 데이터 수집기
Step 3 — 6개 인 임시 분류기
Step 4 — 안정화 / 중복 입력 방지
Step 5 — 호화구 Lv.1 variant 시퀀스 판정
Step 6 — Raw Replay (variant 메타 포함)
Step 7 — Lv.2 variant 활성 (MVP 1.5 진입)
Step 8 — AI 더미 상대 / Shadow Duel
Step 9 — 점수화 / 연출
Step 10 — Lv.3 variant 활성 (MVP 2 진입)
Step 11 — HP / 거리 / 카운터 시스템
Step 12 — Lv.4 별도 밸런스 검토 (후속)
```

---

## 18. 1차 산출물 정의

### HandSealRecognitionLab

```text
- 웹캠 입력
- 양손 랜드마크 표시
- 6개 인 실시간 분류
- 안정화된 인 확정
- 실패 원인 분류
- 데이터 수집용 JSON export
- confusion matrix export
- raw replay export
```

### HandSealTrainingLab

```text
- 호화구 Lv.1 variant 시퀀스 진행
- 성공/실패/취소 판정
- 점수 표시
- 화염/붕괴 연출
- variant 출처 표시 UI (Lv.1 → "만화 일반 시전")
- raw replay 저장 (variant 메타 포함)
- 잠재 variant 미리보기 (도감 형태, 비활성 상태로 표시)
```

### ShadowDuelPrototype

```text
- AI 더미 상대
- 플레이어 variant 사전 선택 UI
- AI variant 풀: Lv.1, Lv.2
- 상대 캐스팅 스트립
- 랜덤 속도/랜덤 variant 풀
- 대응 선택 (키 입력)
- 카운터 성공/실패 판정
```

---

## 19. MVP 2 진입 전 추가 설계 항목

MVP 2는 Shadow Duel보다 범위가 크다. 구현 전에 다음 타입과 규칙을 추가로 정의해야 한다.

```ts
type RangeBand = "close" | "mid" | "long";

type HpState = {
  current: number;
  max: number;
  balanceStatus: BalanceStatus;
};

type DefensiveAction =
  | "water_defense"
  | "earth_wall"
  | "chakra_guard";

type EvasionAction =
  | "substitution"
  | "dash_back";

type InterruptAction =
  | "taijutsu_interrupt";
```

결정해야 할 항목:

```text
1. HP 시작값과 피해 공식
2. 거리/위치 모델
3. 방어술 입력 방식
4. 바꿔치기 입력 방식
5. 체술 끊기 입력 방식
6. 호화구 명중/방어/회피/끊기 결과표
7. Lv.3 마스터형 도입 시 밸런스 변화 검토
8. 방어술/바꿔치기/체술의 variant 구조 (β 원칙 일관 적용)
```

---

## 20. 최종 요약

기술 구현 순서:

```text
1. MVP 0: 호화구 6개 인 인식 가능성 검증
2. 웹캠 + MediaPipe 손 추적
3. 데이터 수집기
4. 6개 인 분류기
5. 안정화 / 중복 입력 방지
6. 호화구 variant 데이터 구조 (5가지 정의, Lv.1만 활성)
7. Lv.1 시퀀스 매처
8. raw replay (variant 메타 포함)
9. 점수화
10. AI 더미 상대 / Shadow Duel (Lv.2 활성)
11. 화염 이펙트
12. HP/거리/카운터 (Lv.3 활성)
```

1차 목표:

```text
HandSealRecognitionLab

대상 인:
Snake / Ram / Monkey / Boar / Horse / Tiger / Unknown

Lv.1 표준 시퀀스:
Snake → Ram → Monkey → Boar → Horse → Tiger

한국식:
사 → 미 → 신 → 해 → 오 → 인

출처: Naruto Manga, 우치하 일족 일반 사용 사례
canonStatus: manga
verificationStatus: cross_referenced
```

검증 완료된 호화구 variant:

```text
Lv.1 표준형 (6개) — manga, cross_referenced
Lv.2 단축형 (3개) — anime (Shippūden Ep.15), cross_referenced
Lv.3 마스터형 (2개) — databook (Rin no Sho), cross_referenced
Lv.4 전설형 (1개) — databook (Hyō no Sho/Fanbook), cross_referenced

verified 승급: 본인이 매체 원본 직접 확인 후 진행
```
