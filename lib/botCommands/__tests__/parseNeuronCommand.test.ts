import { parseNeuronCommand } from '../parseNeuronCommand'

it('extracts BOL and load ID from attach commands', () => {
  expect(parseNeuronCommand('@neuron attach this as BOL for load 12345', 'telegram')).toEqual({
    intent: 'attach_document',
    documentType: 'BOL',
    externalLoadId: '12345',
    source: 'telegram',
  })
})

it('extracts find intent for load documents', () => {
  expect(parseNeuronCommand('@neuron find BOL for load 12345', 'slack')).toEqual({
    intent: 'find_document',
    documentType: 'BOL',
    externalLoadId: '12345',
    source: 'slack',
  })
})
