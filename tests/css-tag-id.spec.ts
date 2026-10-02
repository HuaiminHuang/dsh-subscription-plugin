import { expect, it } from 'vitest'
import { cssTagId } from '../scripts/css-tag-id.ts'

it.each(['C:\\repo\\src\\client\\ModelControl.module.css', '/Users/test/repo/src/client/ModelControl.module.css', '/home/test/repo/src/client/ModelControl.module.css'])(
  'keeps style IDs portable for %s', file => {
    expect(cssTagId('@h2mzzz/dsh-openai-subscription', file)).toBe('@h2mzzz/dsh-openai-subscription/ModelControl.module.css')
  },
)
