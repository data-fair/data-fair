import mongo from '#mongo'
import { type Topics } from '#types/settings/index.js'
import { type AccountKeys } from '@data-fair/lib-express'

// propagate topics modifications to applications and datasets
export const updateTopics = async (owner: AccountKeys, oldTopics: Topics, newTopics: Topics) => {
  for (const topic of newTopics) {
    const filter = { 'owner.type': owner.type, 'owner.id': owner.id, 'topics.id': topic.id }
    const topicReference = JSON.parse(JSON.stringify(topic))
    if (topicReference.icon) topicReference.icon = { name: topicReference.icon.name, svgPath: topicReference.icon.svgPath }
    const patch = { $set: { 'topics.$': topicReference } }
    await mongo.datasets.updateMany(filter, patch)
    await mongo.applications.updateMany(filter, patch)
  }
  for (const oldTopic of oldTopics) {
    if (newTopics.find(t => t.id === oldTopic.id)) continue
    const filter = { 'owner.type': owner.type, 'owner.id': owner.id, 'topics.id': oldTopic.id }
    const patch = { $pull: { topics: { id: oldTopic.id } } }
    await mongo.datasets.updateMany(filter, patch)
    await mongo.applications.updateMany(filter, patch)
  }
}
