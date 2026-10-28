import { describe, expect, it } from 'vitest'
import { cancelActiveAgentCommands, runAgentCommand } from '../agentCommandRunner'

const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`

describe('agent command runner activity', () => {
  it('streams a redacted bounded output tail while retaining command results', async () => {
    const outputs: string[] = []
    const secret = 'local-test-secret-value'
    const command = `${quote(process.execPath)} -e "console.log('first line'); console.log('${secret}'); console.log('last line')"`
    const result = await runAgentCommand({
      command, cwd: process.cwd(), runId: 'runner-output-test', timeoutMs: 5_000,
      knownSecrets: [secret], onOutput: (output) => outputs.push(output),
    })

    expect(result.error).toBeNull()
    expect(result.stdout).toContain('last line')
    expect(outputs.join('\n')).toContain('first line')
    expect(outputs.join('\n')).toContain('[redacted]')
    expect(outputs.join('\n')).not.toContain(secret)
  })

  it('cancels an active command by run id', async () => {
    const command = `${quote(process.execPath)} -e "setTimeout(() => console.log('too late'), 30000)"`
    const resultPromise = runAgentCommand({ command, cwd: process.cwd(), runId: 'runner-cancel-test', timeoutMs: 10_000 })
    await new Promise((resolve) => setTimeout(resolve, 120))
    cancelActiveAgentCommands('runner-cancel-test')
    const result = await Promise.race([
      resultPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('command cancellation took too long')), 2_000)),
    ])
    expect(result.error?.killed).toBe(true)
  })
})
