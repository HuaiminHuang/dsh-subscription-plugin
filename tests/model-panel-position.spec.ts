import { expect, it } from 'vitest'
import { modelPanelPosition } from '../src/client/use-model-panel-position.ts'

it('places the panel above the trigger and keeps it inside the right edge', () => {
  expect(modelPanelPosition({ right: 950, top: 500, bottom: 530 }, { width: 300, height: 200 }, { width: 800, height: 600 }))
    .toEqual({ left: 492, top: 292 })
})

it('flips below when there is no room above and preserves the left margin', () => {
  expect(modelPanelPosition({ right: 100, top: 30, bottom: 60 }, { width: 300, height: 200 }, { width: 800, height: 600 }))
    .toEqual({ left: 8, top: 68 })
})
