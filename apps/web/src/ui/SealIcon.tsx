import type { Seal } from '../seal-recognition/sealTypes'

/**
 * 12간지 인 픽토그램 (자체 제작 SVG).
 * 손 모양을 단순화한 가이드 아이콘 — currentColor를 따라간다.
 */

type SealIconProps = {
  seal: Seal
  size?: number
}

const HAND_FILL = 'currentColor'

export function SealIcon({ seal, size = 44 }: SealIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={`${seal} seal`}
      role="img"
    >
      {renderSeal(seal)}
    </svg>
  )
}

function renderSeal(seal: Seal) {
  switch (seal) {
    case 'tiger':
      // 좁은 합장 탑 + 검지·중지 4개 위로
      return (
        <>
          <rect x={21} y={26} width={10} height={26} rx={5} fillOpacity={0.22} fill={HAND_FILL} />
          <rect x={33} y={26} width={10} height={26} rx={5} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M25 26 V10" />
          <path d="M29 26 V8" />
          <path d="M35 26 V8" />
          <path d="M39 26 V10" />
        </>
      )
    case 'ram':
      // 어긋난 탑 (한 손이 위로)
      return (
        <>
          <rect x={18} y={32} width={11} height={24} rx={5} fillOpacity={0.22} fill={HAND_FILL} />
          <rect x={33} y={20} width={11} height={24} rx={5} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M22 32 L20 16" />
          <path d="M27 32 L26 14" />
          <path d="M37 20 L36 6" />
          <path d="M42 20 L42 8" />
        </>
      )
    case 'snake':
      // 깍지 낀 납작한 상자
      return (
        <>
          <rect x={14} y={26} width={36} height={22} rx={9} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M20 32 L28 40" />
          <path d="M28 32 L36 40" />
          <path d="M36 32 L44 40" />
          <path d="M44 32 L48 36" />
          <path d="M16 36 L20 40" />
        </>
      )
    case 'horse':
      // 넓은 주먹 베이스 + 검지 봉우리
      return (
        <>
          <rect x={12} y={34} width={40} height={18} rx={8} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M28 34 L32 12" />
          <path d="M36 34 L32 12" />
        </>
      )
    case 'boar':
      // 나란한 두 주먹
      return (
        <>
          <rect x={11} y={30} width={19} height={20} rx={8} fillOpacity={0.22} fill={HAND_FILL} />
          <rect x={34} y={30} width={19} height={20} rx={8} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M15 38 H26" strokeWidth={3} />
          <path d="M38 38 H49" strokeWidth={3} />
        </>
      )
    case 'dog':
      // 주먹 위에 얹은 평평한 손
      return (
        <>
          <rect x={22} y={34} width={22} height={20} rx={8} fillOpacity={0.22} fill={HAND_FILL} />
          <rect x={13} y={22} width={38} height={11} rx={5.5} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M24 22 V33" strokeWidth={2.6} />
          <path d="M33 22 V33" strokeWidth={2.6} />
          <path d="M42 22 V33" strokeWidth={2.6} />
        </>
      )
    case 'rat':
      // 감싸 쥔 주먹 + 두 손가락 위로
      return (
        <>
          <rect x={20} y={28} width={26} height={24} rx={9} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M29 28 V10" />
          <path d="M36 28 V10" />
          <path d="M24 38 H42" strokeWidth={3} />
        </>
      )
    case 'ox':
      // 세로손 + 가로손 십자 교차
      return (
        <>
          <rect x={27} y={10} width={11} height={34} rx={5.5} fillOpacity={0.22} fill={HAND_FILL} />
          <rect x={14} y={27} width={38} height={11} rx={5.5} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M31 10 V4" strokeWidth={3} />
          <path d="M52 31 H58" strokeWidth={3} />
        </>
      )
    case 'rabbit':
      // 주먹 + 엄지, 위 손 늘어뜨림
      return (
        <>
          <rect x={22} y={34} width={22} height={20} rx={8} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M24 34 L20 24" />
          <rect x={20} y={16} width={26} height={11} rx={5.5} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M40 27 L44 36" strokeWidth={3} />
          <path d="M34 27 L36 34" strokeWidth={3} />
        </>
      )
    case 'dragon':
      // 물결 깍지 + 양 엄지
      return (
        <>
          <rect x={14} y={30} width={36} height={18} rx={8} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M16 30 L24 22 L32 30 L40 22 L48 30" />
          <path d="M22 24 V10" />
          <path d="M42 24 V10" />
        </>
      )
    case 'monkey':
      // 수평으로 포갠 두 손
      return (
        <>
          <rect x={14} y={24} width={36} height={11} rx={5.5} fillOpacity={0.22} fill={HAND_FILL} />
          <rect x={16} y={37} width={36} height={11} rx={5.5} fillOpacity={0.22} fill={HAND_FILL} />
          <path d="M14 29 H8" strokeWidth={3} />
          <path d="M52 42 H58" strokeWidth={3} />
        </>
      )
    case 'rooster':
      // 손끝을 모은 새 부리/날개
      return (
        <>
          <rect x={6} y={16} width={16} height={12} rx={6} fillOpacity={0.22} fill={HAND_FILL} transform="rotate(28 14 22)" />
          <rect x={42} y={16} width={16} height={12} rx={6} fillOpacity={0.22} fill={HAND_FILL} transform="rotate(-28 50 22)" />
          <path d="M18 26 L30 36" />
          <path d="M46 26 L34 36" />
          <path d="M32 36 L28 46 M32 36 L36 46" strokeWidth={3} />
        </>
      )
    case 'unknown':
    default:
      return (
        <>
          <circle cx={32} cy={32} r={20} fillOpacity={0.12} fill={HAND_FILL} />
          <path d="M26 26 C26 20 38 20 38 27 C38 32 32 32 32 37" />
          <circle cx={32} cy={45} r={1.6} fill="currentColor" stroke="none" />
        </>
      )
  }
}
