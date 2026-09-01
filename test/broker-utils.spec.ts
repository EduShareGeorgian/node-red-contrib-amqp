import { expect } from 'chai'
import { getBrokerUrl, resolveBrokerId } from '../src/broker-utils'

describe('broker utilities', () => {
  it('builds a credential-encoded URI for an explicit virtual host', () => {
    const RED = { settings: {} }
    const broker = {
      host: 'rabbit.example',
      port: 5671,
      vhost: '/',
      tls: true,
      credsFromSettings: false,
      credentials: { username: 'user@host', password: 'p:a/s' },
    }

    expect(getBrokerUrl(RED as any, broker as any)).to.equal(
      'amqps://user%40host:p%3Aa%2Fs@rabbit.example:5671/%2F',
    )
  })

  it('preserves the existing empty-vhost URI form', () => {
    const RED = { settings: {} }
    const broker = {
      host: 'localhost',
      port: 5672,
      vhost: '',
      tls: false,
      credsFromSettings: false,
      credentials: { username: 'guest', password: 'guest' },
    }

    expect(getBrokerUrl(RED as any, broker as any)).to.equal(
      'amqp://guest:guest@localhost:5672/',
    )
  })

  it('resolves nested subflow broker references', () => {
    const evaluateEnvProperty = (value: string) =>
      ({ '${broker}': '${inner}', '${inner}': 'broker-id' })[value] || value
    const RED = { util: { evaluateEnvProperty } }

    expect(resolveBrokerId(RED as any, {} as any, '${broker}')).to.equal(
      'broker-id',
    )
  })

  it('resolves a multi-hop chain of broker placeholders', () => {
    const values = {
      '${broker}': '${amqpOutBroker}',
      '${amqpOutBroker}': '${sharedBroker}',
      '${sharedBroker}': 'broker-id',
    }
    const RED = {
      util: { evaluateEnvProperty: (value: string) => values[value] || value },
    }

    expect(resolveBrokerId(RED as any, {} as any, '${broker}')).to.equal(
      'broker-id',
    )
  })

  it('continues resolving after a parent-scope lookup returns a placeholder', () => {
    const values = {
      '${broker}': '${broker}',
      '${$parent.broker}': '${amqpOutBroker}',
      '${amqpOutBroker}': '${sharedBroker}',
      '${sharedBroker}': 'broker-id',
    }
    const RED = {
      util: { evaluateEnvProperty: (value: string) => values[value] || value },
    }

    expect(resolveBrokerId(RED as any, {} as any, '${broker}')).to.equal(
      'broker-id',
    )
  })

  it('tries parent scope when direct evaluation throws', () => {
    const evaluateEnvProperty = (value: string) => {
      if (value === '${broker}') {
        throw new Error('missing local scope')
      }
      return value === '${$parent.broker}' ? 'broker-id' : value
    }
    const RED = { util: { evaluateEnvProperty } }

    expect(resolveBrokerId(RED as any, {} as any, '${broker}')).to.equal(
      'broker-id',
    )
  })

  it('preserves unresolved placeholders for the caller to reject', () => {
    const RED = {
      util: { evaluateEnvProperty: (value: string) => value },
    }

    expect(resolveBrokerId(RED as any, {} as any, '${broker}')).to.equal(
      '${broker}',
    )
  })

  it('does not add another parent prefix to an explicit parent reference', () => {
    const evaluated: string[] = []
    const RED = {
      util: {
        evaluateEnvProperty: (value: string) => {
          evaluated.push(value)
          return value
        },
      },
    }

    expect(
      resolveBrokerId(RED as any, {} as any, '${$parent.broker}'),
    ).to.equal('${$parent.broker}')
    expect(evaluated).to.deep.equal(['${$parent.broker}'])
  })

  it('returns trimmed direct broker IDs without environment evaluation', () => {
    const evaluateEnvProperty = () => 'unexpected'
    const RED = { util: { evaluateEnvProperty } }

    expect(resolveBrokerId(RED as any, {} as any, '  broker-id  ')).to.equal(
      'broker-id',
    )
  })

  it('retains the six-hop resolution limit', () => {
    const evaluateEnvProperty = (value: string) => {
      const match = value.match(/^\$\{broker(\d+)\}$/)
      return match ? `\${broker${Number(match[1]) + 1}}` : value
    }
    const RED = { util: { evaluateEnvProperty } }

    expect(resolveBrokerId(RED as any, {} as any, '${broker0}')).to.equal(
      '${broker6}',
    )
  })
})
