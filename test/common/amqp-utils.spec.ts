/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai'
import * as sinon from 'sinon'
import { handleAck, processReconnect } from '../../src/common/amqp-utils'

describe('amqp-utils', () => {
  afterEach(() => {
    sinon.restore()
  })

  describe('handleAck()', () => {
    it('performs ack when no manualAck in message', async () => {
      const amqpMock = { ack: sinon.stub() }
      const msg = { payload: 'test' }

      await handleAck(msg, amqpMock)

      expect(amqpMock.ack.calledOnce, 'ack should be called for default mode').to.be.true
      expect(amqpMock.ack.calledWith(msg), 'ack should be called with message').to.be.true
    })

    it('performs ack when ackMode is Ack', async () => {
      const amqpMock = { ack: sinon.stub() }
      const msg = { payload: 'test', manualAck: { ackMode: 'Ack' } }

      await handleAck(msg, amqpMock)

      expect(amqpMock.ack.calledOnce, 'ack should be called for Ack mode').to.be.true
      expect(amqpMock.ack.calledWith(msg), 'ack should be called with message').to.be.true
    })

    it('performs ackAll when ackMode is AckAll', async () => {
      const amqpMock = { ackAll: sinon.stub() }
      const msg = { payload: 'test', manualAck: { ackMode: 'AckAll' } }

      await handleAck(msg, amqpMock)

      expect(amqpMock.ackAll.calledOnce, 'ackAll should be called for AckAll mode').to.be.true
    })

    it('performs nack when ackMode is Nack', async () => {
      const amqpMock = { nack: sinon.stub() }
      const msg = { payload: 'test', manualAck: { ackMode: 'Nack' } }

      await handleAck(msg, amqpMock)

      expect(amqpMock.nack.calledOnce, 'nack should be called for Nack mode').to.be.true
      expect(amqpMock.nack.calledWith(msg), 'nack should be called with message').to.be.true
    })

    it('performs nackAll when ackMode is NackAll', async () => {
      const amqpMock = { nackAll: sinon.stub() }
      const msg = { payload: 'test', manualAck: { ackMode: 'NackAll' } }

      await handleAck(msg, amqpMock)

      expect(amqpMock.nackAll.calledOnce, 'nackAll should be called for NackAll mode').to.be.true
      expect(amqpMock.nackAll.calledWith(msg), 'nackAll should be called with message').to.be.true
    })

    it('performs reject when ackMode is Reject', async () => {
      const amqpMock = { reject: sinon.stub() }
      const msg = { payload: 'test', manualAck: { ackMode: 'Reject' } }

      await handleAck(msg, amqpMock)

      expect(amqpMock.reject.calledOnce, 'reject should be called for Reject mode').to.be.true
      expect(amqpMock.reject.calledWith(msg), 'reject should be called with message').to.be.true
    })

    it('closes and returns early when ackMode is Close', async () => {
      const closeSpy = sinon.stub().resolves()
      const amqpMock = { close: closeSpy, ack: sinon.stub() }
      const msg = { payload: 'test', manualAck: { ackMode: 'Close' } }

      const closeRequested = await handleAck(msg, amqpMock)

      expect(closeSpy.calledOnce, 'close should be called for Close mode').to.be.true
      expect(amqpMock.ack.calledOnce, 'ack should not be called after close').to.be.false
      expect(closeRequested, 'Close mode should signal a deliberate close').to.be.true
    })

    it('does not signal close for regular ack modes', async () => {
      const amqpMock = { ack: sinon.stub() }
      const msg = { payload: 'test', manualAck: { ackMode: 'Ack' } }

      const closeRequested = await handleAck(msg, amqpMock)

      expect(closeRequested, 'Ack mode should not signal a deliberate close').to.be.false
    })
  })

  describe('processReconnect()', () => {
    it('calls reconnect when msg.payload.reconnectCall is true', async () => {
      const reconnect = sinon.stub().resolves()
      const done = sinon.stub()
      const msg = { payload: { reconnectCall: true } }

      await processReconnect(msg, reconnect, done)

      expect(reconnect.calledOnce, 'reconnect should be called when reconnectCall is true').to.be.true
      expect(done.calledOnce, 'done callback should be called').to.be.true
    })

    it('does not call reconnect when msg.payload.reconnectCall is false', async () => {
      const reconnect = sinon.stub().resolves()
      const done = sinon.stub()
      const msg = { payload: { reconnectCall: false } }

      await processReconnect(msg, reconnect, done)

      expect(reconnect.calledOnce, 'reconnect should not be called when reconnectCall is false').to.be.false
      expect(done.calledOnce, 'done callback should be called').to.be.true
    })

    it('does not call reconnect when msg.payload is missing', async () => {
      const reconnect = sinon.stub().resolves()
      const done = sinon.stub()
      const msg = {}

      await processReconnect(msg, reconnect, done)

      expect(reconnect.calledOnce, 'reconnect should not be called when payload is missing').to.be.false
      expect(done.calledOnce, 'done callback should be called').to.be.true
    })

    it('does not call reconnect when reconnect is not a function', async () => {
      const reconnect = null
      const done = sinon.stub()
      const msg = { payload: { reconnectCall: true } }

      await processReconnect(msg, reconnect, done)

      expect(done.calledOnce, 'done callback should be called').to.be.true
    })

    it('calls done callback when it is provided', async () => {
      const reconnect = sinon.stub().resolves()
      const done = sinon.stub()
      const msg = { payload: {} }

      await processReconnect(msg, reconnect, done)

      expect(done.calledOnce, 'done callback should be called').to.be.true
    })

    it('handles missing done callback gracefully', async () => {
      const reconnect = sinon.stub().resolves()
      const msg = { payload: {} }

      // Should not throw
      try {
        await processReconnect(msg, reconnect, undefined)
        expect(true, 'processReconnect should complete without error').to.be.true
      } catch (e) {
        expect.fail(`processReconnect should not throw: ${e.message}`)
      }
    })
  })
})
