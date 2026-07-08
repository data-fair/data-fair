import mongo from '#mongo'
import { type Topics } from '#types/settings/index.js'
import { type AccountKeys } from '@data-fair/lib-express'
import { stampHistorizeMany } from '../../integrity/outbox.ts'

// propagate topics modifications to applications and datasets
export const updateTopics = async (owner: AccountKeys, oldTopics: Topics, newTopics: Topics) => {
  for (const topic of newTopics) {
    const filter = { 'owner.type': owner.type, 'owner.id': owner.id, 'topics.id': topic.id }
    const topicReference = JSON.parse(JSON.stringify(topic))
    if (topicReference.icon) topicReference.icon = { name: topicReference.icon.name, svgPath: topicReference.icon.svgPath }
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
