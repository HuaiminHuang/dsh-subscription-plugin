import { describe, expect, it, vi } from 'vitest'
import { createImageTool } from '../src/imagegen/tool.ts'
import { generateImage } from '../src/imagegen/backend.ts'
import { loadReferenceImages, parseReferenceSelectors } from '../src/imagegen/references.ts'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

const png = Buffer.from('89504e470d0a1a0a', 'hex')
const ref = (id: number, bytes = png.length): ImageAttachmentRef => ({
  attachmentId: `sha256:${id.toString(16).padStart(64, '0')}` as ImageAttachmentRef['attachmentId'],
  mediaType: 'image/png', bytes, width: 1, height: 1,
})
const user = (...refs: ImageAttachmentRef[]) => ({ type: 'user/message', data: { role: 'user', content: refs.map(attachment => ({ type: 'image', attachment })) } })
const jwt = `a.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' } })).toString('base64url')}.b`
const exec = () => ({ agent: { session: { id: 'example' } }, signal: new AbortController().signal })
function fixture(refs: ImageAttachmentRef[]) {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({data:[{b64_json:png.toString('base64') }]}), {headers:{'content-type':'application/json'}}))
  const source = { events: vi.fn(async () => [user(...refs)]), readImage: vi.fn(async (r: ImageAttachmentRef) => ({ref:r, data:png})) }
  const withImageAuth = vi.fn(async <T>(signal: AbortSignal, run: (access: string, signal: AbortSignal) => Promise<T>) => run(jwt, signal))
  const saveImages = vi.fn(async () => [ref(100)])
  return { source, fetcher, withImageAuth, saveImages, tool:createImageTool({fetcher,saveImages,withImageAuth,references:source}) }
}

describe('session-owned reference generation', () => {
  it('accepts ten ordered references, sends real image bytes to edits and preserves card metadata', async () => {
    const refs = Array.from({length:10},(_,i)=>ref(i+1))
    const {tool, source, fetcher} = fixture(refs)
    const result = await tool.execute({prompt:'Combine the references', reference_images:refs.map(r=>({attachment_id:r.attachmentId}))}, exec() as never)
    expect(source.events).toHaveBeenCalledWith('example',expect.any(AbortSignal))
    expect(source.readImage.mock.calls.map(call=>call[0])).toEqual(refs)
    const [url,init] = fetcher.mock.calls[0] as unknown as [string,RequestInit]
    expect(url).toBe('https://chatgpt.com/backend-api/codex/images/edits')
    expect(JSON.parse(init.body as string).images).toEqual(refs.map(()=>({image_url:`data:image/png;base64,${png.toString('base64')}`})))
    expect(result).toEqual({sessionId:'example',image:ref(100)})
    expect(tool.output.presentationMeta?.({},result as never)).toEqual(result)
  })

  it('rejects eleven before authorization, session/attachment reads or network access', async () => {
    const {tool, source, fetcher, withImageAuth} = fixture([ref(1)])
    await expect(tool.execute({prompt:'star', reference_images:Array.from({length:11},()=>({attachment_id:ref(1).attachmentId}))}, exec() as never)).rejects.toThrow('At most 10')
    expect(withImageAuth).not.toHaveBeenCalled()
    expect(source.events).not.toHaveBeenCalled()
    expect(source.readImage).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps empty reference arrays on the existing generations endpoint', async () => {
    const {tool, source,fetcher} = fixture([])
    await tool.execute({prompt:'star',reference_images:[]},exec() as never)
    expect(source.events).not.toHaveBeenCalled()
    const [url,init] = fetcher.mock.calls[0] as unknown as [string,RequestInit]
    expect(url).toContain('/images/generations')
    expect(JSON.parse(init.body as string)).not.toHaveProperty('images')
  })

  it('rejects an attachment outside the owning session before reading storage or sending it', async () => {
    const {tool,source,fetcher} = fixture([ref(1)])
    await expect(tool.execute({prompt:'star',reference_images:[{attachment_id:ref(2).attachmentId}]},exec() as never)).rejects.toThrow('unavailable in this session')
    expect(source.readImage).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('allows an earlier successful generated result only through its session-matched call', async () => {
    const r=ref(1)
    const events = [
      {type:'tool/call',data:{callId:'call-1|fc-1',name:'codex_generate_image'}},
      {type:'tool/result',data:{message:{toolCallId:'call-1|fc-1',isError:false,content:[{type:'text',text:'Generated one image. It is available in this tool result.'}]},meta:{sessionId:'example',image:r}}},
    ]
    const source={events:async()=>events,readImage:vi.fn(async()=>({ref:r,data:png}))}
    expect(await loadReferenceImages(source,'example',[{tool_call_id:'call-1|fc-1'}],exec().signal)).toEqual([{data:png,mediaType:'image/png'}])
    await expect(loadReferenceImages(source,'another',[{tool_call_id:'call-1|fc-1'}],exec().signal)).rejects.toThrow('unavailable')
    expect(source.readImage).toHaveBeenCalledOnce()
  })

  it('rejects references found only in failed or assistant results', async () => {
    const r=ref(1)
    const source={events:async()=>[
      {type:'tool/result',data:{message:{isError:true,content:[{type:'image',attachment:r}]}}},
      {type:'assistant/message',data:{message:{content:[{type:'image',attachment:r}]}}},
    ],readImage:vi.fn()}
    await expect(loadReferenceImages(source,'example',[{attachment_id:r.attachmentId}],exec().signal)).rejects.toThrow('unavailable')
    expect(source.readImage).not.toHaveBeenCalled()
  })

  it('rejects excessive total bytes before reading storage', async () => {
    const refs=[ref(1,20_000_000),ref(2,20_000_000),ref(3,20_000_000)]
    const source={events:async()=>[user(...refs)],readImage:vi.fn()}
    await expect(loadReferenceImages(source,'example',refs.map(r=>({attachment_id:r.attachmentId})),exec().signal)).rejects.toThrow('50 MB')
    expect(source.readImage).not.toHaveBeenCalled()
  })

  it('contains storage failure details without falling back to text-only generation', async () => {
    const {tool,source,fetcher}=fixture([ref(1)])
    source.readImage.mockRejectedValue(new Error('private path and token'))
    await expect(tool.execute({prompt:'star',reference_images:[{attachment_id:ref(1).attachmentId}]},exec() as never)).rejects.toThrow('could not be read')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('honors cancellation while awaiting an attachment and never starts generation afterward', async () => {
    const {tool,source,fetcher}=fixture([ref(1)])
    let entered!:()=>void
    const reading = new Promise<void>(resolve=>{entered=resolve})
    let release!:(value:{ref:ImageAttachmentRef,data:Buffer})=>void
    source.readImage.mockImplementation(async()=>{entered();return new Promise(resolve=>{release=resolve})})
    const abort=new AbortController()
    const task=tool.execute({prompt:'star',reference_images:[{attachment_id:ref(1).attachmentId}]},{...exec(),signal:abort.signal} as never)
    const assertion=expect(task).rejects.toThrow('cancelled')
    await reading
    abort.abort()
    release({ref:ref(1),data:png})
    await assertion
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([null, 'https://private/image.png', [{attachment_id:'../private'}], [{attachment_id:ref(1).attachmentId,tool_call_id:'call'}], [{}]])('rejects malformed selectors %j',value=>{
    expect(()=>parseReferenceSelectors(value)).toThrow()
  })

  it('also enforces the ten-image limit at the backend boundary',async()=>{
    const fetcher=vi.fn()
    await expect(generateImage({fetcher,saveImages:vi.fn()},jwt,'star',exec().signal,Array.from({length:11},()=>({data:png,mediaType:'image/png'})))).rejects.toThrow('At most 10')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
