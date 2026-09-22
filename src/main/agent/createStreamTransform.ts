import { smoothStream, type ToolSet } from 'ai'

export function createStreamTransform<TOOLS extends ToolSet>() {
  return smoothStream<TOOLS>({
    chunking: new Intl.Segmenter('zh-CN', { granularity: 'word' }),
    delayInMs: 10,
  })
}
