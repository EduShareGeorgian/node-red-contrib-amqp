/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai'
import * as sinon from 'sinon'
import Amqp from '../../src/Amqp'

describe('amqp-in-manual-ack Node', () => {
  afterEach(function () {
    sinon.restore()
  })

  // Placeholder: Integration tests require node-red-node-test-helper which is incompatible with node-red 4.x
  // Unit tests for core AMQP logic are covered in Amqp.spec.ts
})
