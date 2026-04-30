import { computed, type InjectionKey, inject, provide, type Ref } from 'vue'
import { $uiConfig, $apiPath } from '~/context'

const showAgentChatKey: InjectionKey<Ref<boolean>> = Symbol('showAgentChat')

export function provideShowAgentChat (session: ReturnType<typeof useSession>) {
  const agentChatFetch = ($uiConfig.agentsIntegration && session.account.value)
    ? useFetch<{ agentChat: boolean }>(`${$apiPath}/settings/${session.account.value.type}/${session.account.value.id}/agent-chat`)
    : null
  const showAgentChat = computed(() => !!agentChatFetch?.data.value?.agentChat)
  provide(showAgentChatKey, showAgentChat)
  return showAgentChat
}

export function useShowAgentChat () {
  return inject(showAgentChatKey, computed(() => false))
}
