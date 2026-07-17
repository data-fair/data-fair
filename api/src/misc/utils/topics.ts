import equal from 'deep-equal'
import mongo from '#mongo'
import { type Topics } from '#types/settings/index.js'
import { type AccountKeys } from '@data-fair/lib-express'
import { stampHistorizeMany } from '../../integrity/outbox.ts'

// the reference stored on resources: the topic minus non-persisted icon extras
const topicReferenceOf = (topic: any) => {
  const reference = JSON.parse(JSON.stringify(topic))
  if (reference.icon) reference.icon = { name: reference.icon.name, svgPath: reference.icon.svgPath }
  return reference
}

// propagate topics modifications to applications and datasets
export const updateTopics = async (owner: AccountKeys, oldTopics: Topics, newTopics: Topics) => {
  for (const topic of newTopics) {
    const topicReference = topicReferenceOf(topic)
    // unchanged topic → no propagation and, crucially, no outbox stamp: every settings save
    // (even a single unrelated key through PATCH) flows through here with old == new, and
    // blanket re-anchoring integrity-active datasets would silently legitimize any
    // not-yet-detected out-of-band metadata tamper
    const oldTopic = oldTopics.find(t => t.id === topic.id)
    if (oldTopic && equal(topicReference, topicReferenceOf(oldTopic))) continue
    const filter = { 'owner.type': owner.type, 'owner.id': owner.id, 'topics.id': topic.id }
    const patch = { $set: { 'topics.$': topicReference } }
    await mongo.datasets.updateMany(filter, patch)
    await stampHistorizeMany(filter)
    await mongo.applications.updateMany(filter, patch)
  }
  for (const oldTopic of oldTopics) {
    if (newTopics.find(t => t.id === oldTopic.id)) continue
    const filter = { 'owner.type': owner.type, 'owner.id': owner.id, 'topics.id': oldTopic.id }
    const patch = { $pull: { topics: { id: oldTopic.id } } }
    // stamp BEFORE the $pull: the pull removes the very field ('topics.id') this filter matches,
    // so stamping after would match nothing (over-stamping here is harmless, the relay dedupes)
    await stampHistorizeMany(filter)
    await mongo.datasets.updateMany(filter, patch)
    await mongo.applications.updateMany(filter, patch)
  }
}
