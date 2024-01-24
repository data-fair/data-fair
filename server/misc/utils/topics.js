
// propagate topics modifications to applications and datasets
exports.updateTopics = async (db, owner, oldTopics, newTopics) => {
  for (const topic of newTopics) {
    const filter = { 'owner.type': owner.type, 'owner.id': owner.id, 'topics.id': topic.id }
    const topicReference = JSON.parse(JSON.stringify(topic))
    if (topicReference.icon) delete topicReference.icon.svg
    const patch = { $set: { 'topics.$': topicReference } }
    await db.collection('datasets').updateMany(filter, patch)
    await db.collection('applications').updateMany(filter, patch)
  }
  for (const oldTopic of oldTopics) {
    if (newTopics.find(t => t.id === oldTopic.id)) continue
    const filter = { 'owner.type': owner.type, 'owner.id': owner.id, 'topics.id': oldTopic.id }
    const patch = { $pull: { topics: { id: oldTopic.id } } }
    await db.collection('datasets').updateMany(filter, patch)
    await db.collection('applications').updateMany(filter, patch)
  }
}
