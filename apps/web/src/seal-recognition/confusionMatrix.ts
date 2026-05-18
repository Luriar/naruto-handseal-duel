import type { Seal } from './sealTypes'

export type ConfusionMatrix = Record<Seal, Record<Seal, number>>

export type SealMetric = {
  seal: Seal
  precision: number
  recall: number
  truePositive: number
  falsePositive: number
  falseNegative: number
}

export function createConfusionMatrix(labels: Seal[]): ConfusionMatrix {
  return Object.fromEntries(
    labels.map((actual) => [
      actual,
      Object.fromEntries(labels.map((predicted) => [predicted, 0])),
    ]),
  ) as ConfusionMatrix
}

export function addConfusionMatrixObservation(
  matrix: ConfusionMatrix,
  actual: Seal,
  predicted: Seal,
): ConfusionMatrix {
  return {
    ...matrix,
    [actual]: {
      ...matrix[actual],
      [predicted]: (matrix[actual]?.[predicted] ?? 0) + 1,
    },
  }
}

export function calculateSealMetrics(
  matrix: ConfusionMatrix,
  labels: Seal[],
): SealMetric[] {
  return labels.map((seal) => {
    const truePositive = matrix[seal]?.[seal] ?? 0
    const falsePositive = labels.reduce(
      (sum, actual) => sum + (actual === seal ? 0 : (matrix[actual]?.[seal] ?? 0)),
      0,
    )
    const falseNegative = labels.reduce(
      (sum, predicted) =>
        sum + (predicted === seal ? 0 : (matrix[seal]?.[predicted] ?? 0)),
      0,
    )

    return {
      seal,
      precision: divideOrZero(truePositive, truePositive + falsePositive),
      recall: divideOrZero(truePositive, truePositive + falseNegative),
      truePositive,
      falsePositive,
      falseNegative,
    }
  })
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}
