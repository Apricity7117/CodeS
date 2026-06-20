import { onMounted, ref } from 'vue'
import { getHomeDirectory } from '../api/codexGateway'

/**
 * 管理用户主目录状态
 */
export function useHomeDirectory() {
  const homeDirectory = ref('')

  async function loadHomeDirectory(): Promise<string> {
    try {
      homeDirectory.value = await getHomeDirectory()
      return homeDirectory.value
    } catch {
      homeDirectory.value = ''
      return ''
    }
  }

  onMounted(() => {
    void loadHomeDirectory()
  })

  return {
    homeDirectory,
    loadHomeDirectory,
  }
}
