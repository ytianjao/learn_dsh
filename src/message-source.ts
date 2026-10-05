import type {MessageSourceMap} from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** LearnLoop Host-injected instructions (verifier context, agent wake-ups); never learner-authored. */
    learnloop:{kind:'learnloop';plugin:'learnloop';form:'instructions'}
  }
}

/** Source identity for LearnLoop Host-injected instruction messages. */
export const learnloopInstructionsSource:MessageSourceMap['learnloop']={kind:'learnloop',plugin:'learnloop',form:'instructions'}
